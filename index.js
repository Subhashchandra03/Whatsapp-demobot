const puppeteer = require('puppeteer');
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    logger
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

// Silence the logger


// Baileys setup
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state
    });

    // Listen for QR code to show
    sock.ev.on('connection.update', (update) => {
        const { qr } = update;
        if (qr) {
            qrcode.generate(qr, { small: true });
        }
    });

    sock.ev.on('creds.update', saveCreds);

    function extractText(msg) {
        if (!msg.message) return '';
        if (msg.message.conversation) return msg.message.conversation;
        if (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) return msg.message.extendedTextMessage.text;
        if (msg.message.imageMessage && msg.message.imageMessage.caption) return msg.message.imageMessage.caption;
        if (msg.message.videoMessage && msg.message.videoMessage.caption) return msg.message.videoMessage.caption;
        if (msg.message.ephemeralMessage) return extractText({ message: msg.message.ephemeralMessage.message });
        if (msg.message.viewOnceMessage) return extractText({ message: msg.message.viewOnceMessage.message });
        if (msg.message.buttonsResponseMessage && msg.message.buttonsResponseMessage.selectedButtonId) return msg.message.buttonsResponseMessage.selectedButtonId;
        if (msg.message.listResponseMessage && msg.message.listResponseMessage.singleSelectReply && msg.message.listResponseMessage.singleSelectReply.selectedRowId) return msg.message.listResponseMessage.singleSelectReply.selectedRowId;
        return '';
    }

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message || !msg.key.remoteJid || msg.key.fromMe) return;

        console.log('Received message:', JSON.stringify(msg, null, 2));

        const text = extractText(msg).trim();
        const jid = msg.key.remoteJid;

        if (['hi', 'hello', 'Hi', 'Hello'].includes(text)) {
            await sock.sendMessage(jid, { text: '👋 Welcome! Please send your 10-digit Roll Number.' });
        } else if (/^[a-zA-Z0-9]{10}$/.test(text)) {
            const rollNo = text;
            console.log(`Received roll number: ${rollNo}`);

            try {
                const result = await getResultFromWebsite(rollNo);
                await sock.sendMessage(jid, { text: `📄 Attendance for ${rollNo}:\n\n${result}` });
            } catch (error) {
                console.error('Error fetching result:', error);
                await sock.sendMessage(jid, { text: '❌ Sorry, unable to fetch the result. Please try again later or check your roll number.' });
            }
        } else {
            await sock.sendMessage(jid, { text: '⚠️ Please enter a valid 10-character roll number (letters and digits allowed).' });
        }
    });
}

// Puppeteer-based scraping
async function getResultFromWebsite(rollNo) {
    const browser = await puppeteer.launch({
        headless: 'new',
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', // adjust if needed
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    try {
        await page.goto('http://tkrcet.in/', { waitUntil: 'networkidle0' });

        // Fill login form
        await page.type('#login-username', rollNo);
        await page.type('#login-password', rollNo);
        await page.click('.btn.btn-primary.btn-sm.bg-gradient.btn-signin');
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        const currentUrl = page.url();
        if (currentUrl.includes('login')) {
            throw new Error('Login failed. Possibly invalid roll number.');
        }

        await page.waitForSelector('.table.table-bordered.border-danger.table-sm.small.fw-semibold.mb-2', { timeout: 5000 });

        const result = await page.evaluate(() => {
            const table = document.querySelector('.table.table-bordered.border-danger.table-sm.small.fw-semibold.mb-2');
            if (!table) return 'No result table found.';

            let resultText = '';
            const rows = table.querySelectorAll('tr');

            rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                const rowText = Array.from(cells).map(cell => cell.innerText).join(' | ');
                resultText += rowText + '\n';
            });

            return resultText.trim();
        });

        await browser.close();
        return result;
    } catch (err) {
        await browser.close();
        throw err;
    }
}

startBot().catch((err) => {
    console.error('Bot crashed:', err);
});
