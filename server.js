const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './新建 文本文档.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.wav': 'audio/wav',
        '.mp4': 'video/mp4',
        '.woff': 'application/font-woff',
        '.ttf': 'application/font-ttf',
        '.eot': 'application/vnd.ms-fontobject',
        '.otf': 'application/font-otf',
        '.wasm': 'application/wasm'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                fs.readFile('./404.html', (err, content404) => {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end(content404 || '404 Not Found', 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// 加载持久化的排行榜数据
let savedLeaderboard = [];
try {
    if (fs.existsSync('leaderboard.json')) {
        const data = fs.readFileSync('leaderboard.json', 'utf8');
        savedLeaderboard = JSON.parse(data);
    }
} catch (err) {
    console.error('加载排行榜数据失败:', err);
}

server.listen(8082, '0.0.0.0', () => {
    console.log('Server running on http://0.0.0.0:8082');
});
let players = new Map();          // id -> {socket, score}

io.on('connection', (socket) => {
    // 获取玩家IP地址
    const clientIP = socket.handshake.address;
    
    socket.on('join', (data) => {
        // 检查玩家是否在持久化数据中
        const savedPlayer = savedLeaderboard.find(p => p.ip === clientIP);
        const initialScore = savedPlayer ? savedPlayer.score : 0;
        players.set(data.id, { socket, score: initialScore, ip: clientIP });
        // 发送当前排行榜数据
        broadcastLeaderboard();
    });
    
    socket.on('score', (data) => {
        const p = players.get(data.id);
        if (p) p.score = data.score;
        broadcastLeaderboard();
        saveLeaderboard();
    });
    
    socket.on('disconnect', () => {
        [...players.entries()].forEach(([id, p]) => {
            if (p.socket === socket) players.delete(id);
        });
        broadcastLeaderboard();
        saveLeaderboard();
    });
});

function broadcastLeaderboard() {
    const list = [...players.values()].map(p => ({ 
        id: [...players.entries()].find(e => e[1] === p)[0], 
        score: p.score,
        ip: p.ip
    }));
    io.emit('leaderboard', list);
}

function saveLeaderboard() {
    const list = [...players.values()].map(p => ({ 
        id: [...players.entries()].find(e => e[1] === p)[0], 
        score: p.score,
        ip: p.ip
    }));
    
    // 按分数排序
    list.sort((a, b) => b.score - a.score);
    
    // 保存到JSON文件
    fs.writeFile('leaderboard.json', JSON.stringify(list, null, 2), (err) => {
        if (err) {
            console.error('保存排行榜数据失败:', err);
        }
    });
}