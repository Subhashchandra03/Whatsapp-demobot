const puppeteer = require('puppeteer');
const venom = require('venom-bot');

// Your bot setup code here
venom.create({
    session: 'my-whatsapp-session',
    multidevice: true,
}).then((client) => {
    console.log('Bot is ready!');

    client.onMessage(async (message) => {
        if(message.body === "hi" || message.body === "hello" || message.body === "Hi"){
            client.sendText(message.from, 'Welcome! How can I assist you today?')
        }
    
        // If the message is a roll number with length 10
        else if (message.body.trim().length === 10) {
            const rollNo = message.body.trim();
            console.log(`Roll number received: ${rollNo}`);

            try {
                // Call the function to fetch result from the website
                const result = await getResultFromWebsite(rollNo);

                // Send the result back to the user
                client.sendText(message.from, `Attendance for roll number ${rollNo}: ${result}`)
                    .then((result) => {
                        console.log('Attendance sent:', result);
                    })
                    .catch((error) => {
                        console.error('Error sending attendance:', error);
                    });
            } catch (error) {
                client.sendText(message.from, 'Sorry, I could not fetch the result at the moment.')
                    .then((result) => {
                        console.log('Error response sent:', result);
                    })
                    .catch((error) => {
                        console.error('Error sending message:', error);
                    });
            }
        } else {
            client.sendText(message.from, 'I did not understand that. Please enter a valid roll number (exactly 10 characters).')
                .then((result) => {
                    console.log('Error response sent:', result);
                })
                .catch((error) => {
                    console.error('Error sending message:', error);
                });
        }
    });

    // Function to scrape result from the website using Puppeteer
    async function getResultFromWebsite(rollNo) {
        const browser = await puppeteer.launch({ headless: false }); // Run in non-headless mode for debugging
        const page = await browser.newPage();
        
        // Navigate to the login page
        await page.goto('http://tkrcet.in/');

        // Input the roll number as both username and password
        await page.type('#login-username', rollNo); // Replace with the actual selector for username
        await page.type('#login-password', rollNo); // Replace with the actual selector for password

        // Click the login button
        await page.click('.btn.btn-primary.btn-sm.bg-gradient.btn-signin'); // Replace with the actual selector for login button

        // Wait for the page to load after login
        await page.waitForNavigation({ waitUntil: 'networkidle0' });

        // Log the current URL after login to verify navigation
        console.log('Current URL after login:', page.url());

        // Wait for the results table to appear
        await page.waitForSelector('.table.table-bordered.border-danger.table-sm.small.fw-semibold.mb-2', { timeout: 5000 });

        // Extract the result from the table
        const result = await page.evaluate(() => {
            const table = document.querySelector('.table.table-bordered.border-danger.table-sm.small.fw-semibold.mb-2');
            if (table) {
                const rows = table.querySelectorAll('tr');
                let results = '';
                rows.forEach((row) => {
                    const cells = row.querySelectorAll('td');
                    cells.forEach((cell) => {
                        results += cell.innerText + ' ';
                    });
                    results += '\n';
                });
                return results.trim();
            } else {
                return 'No results found.';
            }
        });

        // Close the browser
        await browser.close();

        return result;
    }

}).catch((error) => {
    console.error('Error during bot initialization:', error);
});

