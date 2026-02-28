const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Настройка порта для Render (берем из системы или 3000 для локалки)
const PORT = process.env.PORT || 3000;

// Лимиты запросов для защиты от спама
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100,
    message: "Слишком много запросов, попробуй позже."
});
app.use('/api/', limiter);

if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Используем переменную окружения для базы данных (настрой её в панели Render)
// Если не настроишь там, будет использоваться твоя старая ссылка по умолчанию
const mongoURI = process.env.MONGO_URI || 'mongodb+srv://ZyabMessenger:Zyablik123@zyabmessenger.9kzwmu3.mongodb.net/ZyabGram?retryWrites=true&w=majority&appName=ZyabMessenger';

mongoose.connect(mongoURI, { family: 4, serverSelectionTimeoutMS: 5000 })
.then(() => console.log("✅ СИСТЕМА ЗАПУЩЕНА: База на связи!"))
.catch(err => console.error("❌ ОШИБКА БАЗЫ:", err.message));

const User = mongoose.model('User', { username: String, surname: String, email: String, avatar: String });
const Msg = mongoose.model('Message', { 
    from: String, to: String, text: String, 
    time: { type: Date, default: Date.now },
    read: { type: Boolean, default: false } 
});

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

app.post('/api/register', upload.single('avatar'), async (req, res) => {
    const { username, surname, email } = req.body;
    let user = await User.findOne({ email });
    if (!user) {
        user = new User({ 
            username, 
            surname, 
            email, 
            avatar: req.file ? `/uploads/${req.file.filename}` : '/default-avatar.png' 
        });
        await user.save();
    }
    res.json(user);
});

app.get('/api/users', async (req, res) => res.json(await User.find()));
app.get('/api/history/:u1/:u2', async (req, res) => {
    const history = await Msg.find({ 
        $or: [{ from: req.params.u1, to: req.params.u2 }, { from: req.params.u2, to: req.params.u1 }] 
    }).sort('time');
    res.json(history);
});

io.on('connection', (socket) => {
    socket.on('join', (email) => socket.join(email));
    
    socket.on('private message', async (data) => {
        if(!data.text || data.text.trim() === "") return;
        const msg = new Msg(data);
        await msg.save();
        io.to(data.to).to(data.from).emit('new message', msg);
    });

    socket.on('delete message', async (msgId) => {
        try {
            await Msg.findByIdAndDelete(msgId);
            io.emit('message deleted', msgId);
        } catch (e) { console.log("Ошибка удаления:", e); }
    });
});

// ЗАПУСК НА ПОРТУ ОТ RENDER
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 ZyabGram взлетел! Порт: ${PORT}`);
});