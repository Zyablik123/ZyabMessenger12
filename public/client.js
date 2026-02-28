const socket = io();
let currentUser = null, targetUser = null;

function encrypt(text) { return btoa(unescape(encodeURIComponent(text))).split('').reverse().join(''); }
function decrypt(encoded) { 
    try { return decodeURIComponent(escape(atob(encoded.split('').reverse().join('')))); } 
    catch(e) { return encoded; } 
}

function logout() {
    if(confirm("Реально хочешь выйти?")) {
        localStorage.removeItem('zyab_email');
        location.reload();
    }
}

function applyTheme(color) {
    let styleTag = document.getElementById('zyab-theme-style') || document.createElement('style');
    styleTag.id = 'zyab-theme-style';
    document.head.appendChild(styleTag);
    styleTag.innerHTML = `:root { --primary: ${color} !important; } .msg-row.my .msg-bubble, button, .contact.active { background-color: ${color} !important; color: white !important; }`;
}

// ВОТ ТУТ ПРОВЕРКА ОБНОВЛЕНИЯ
window.onload = async () => {
    const lastSeen = localStorage.getItem('lastUpdateSeen');
    const currentVersion = '1.1'; 

    if (lastSeen !== currentVersion) {
        fetch('/update.html')
            .then(res => res.ok ? res.text() : null)
            .then(html => {
                if(html) {
                    const div = document.createElement('div');
                    div.innerHTML = html;
                    document.body.appendChild(div);
                }
            });
    }

    applyTheme(localStorage.getItem('zyab_theme') || '#2481cc');
    const savedEmail = localStorage.getItem('zyab_email');
    if (savedEmail) {
        const res = await fetch('/api/users');
        const users = await res.json();
        currentUser = users.find(u => u.email === savedEmail);
        if (currentUser) {
            document.getElementById('regModal').style.display = 'none';
            socket.emit('join', currentUser.email);
            loadUsers();
        } else { document.getElementById('regModal').style.display = 'flex'; }
    } else { document.getElementById('regModal').style.display = 'flex'; }
};

document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/register', { method: 'POST', body: new FormData(e.target) });
    currentUser = await res.json();
    localStorage.setItem('zyab_email', currentUser.email);
    document.getElementById('regModal').style.display = 'none';
    socket.emit('join', currentUser.email);
    loadUsers();
};

async function loadUsers() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const list = document.getElementById('userList');
    list.innerHTML = ''; 
    users.filter(u => u.email !== currentUser.email).forEach(u => {
        const contact = document.createElement('div');
        contact.className = 'contact';
        contact.onclick = () => selectChat(u.email, u.username, u.avatar);
        const img = document.createElement('img');
        img.src = u.avatar; img.className = 'avatar';
        const name = document.createElement('b');
        name.textContent = u.username;
        contact.appendChild(img); contact.appendChild(name);
        list.appendChild(contact);
    });
}

async function selectChat(email, name, avatar) {
    targetUser = email;
    document.getElementById('chatHeader').textContent = name;
    const res = await fetch(`/api/history/${currentUser.email}/${targetUser}`);
    const history = await res.json();
    document.getElementById('messages').innerHTML = '';
    history.forEach(renderMessage);
}

function renderMessage(data) {
    const isMy = data.from === currentUser.email;
    const div = document.createElement('div');
    div.className = `msg-row ${isMy ? 'my' : ''}`;
    div.id = `msg-${data._id}`;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    const textDiv = document.createElement('div');
    textDiv.className = 'msg-text';
    textDiv.textContent = data.text ? decrypt(data.text) : "Файл";
    const footer = document.createElement('div');
    footer.style = "display:flex; justify-content:flex-end; align-items:center; font-size:10px; opacity:0.7; margin-top:4px;";
    footer.innerHTML = `<span>${new Date(data.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>`;
    if (isMy) {
        const delBtn = document.createElement('span');
        delBtn.innerHTML = ' 🗑️'; delBtn.style.cursor = 'pointer';
        delBtn.onclick = () => { if(confirm("Удалить?")) socket.emit('delete message', data._id); };
        footer.appendChild(delBtn);
    }
    bubble.appendChild(textDiv); bubble.appendChild(footer);
    div.innerHTML = `<img src="${isMy ? currentUser.avatar : '/default-avatar.png'}" class="avatar" style="width:30px; height:30px;">`;
    div.appendChild(bubble);
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
}

let lastSend = 0;
function sendText() {
    const now = Date.now();
    if (now - lastSend < 1000) return; 
    const input = document.getElementById('msgInput');
    if(!input.value.trim() || !targetUser) return;
    socket.emit('private message', { from: currentUser.email, to: targetUser, text: encrypt(input.value.trim()), fileType: 'text' });
    input.value = '';
    lastSend = now;
}

socket.on('new message', (data) => { if (data.from === targetUser || data.from === currentUser.email) renderMessage(data); });
socket.on('message deleted', (id) => { const el = document.getElementById(`msg-${id}`); if(el) el.remove(); });