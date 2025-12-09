const puppeteer = require('puppeteer');
const accountInfo = require('./accountInfoGenerator');
const verifiCode = require('./getCode');
const email = require('./createFakeMail');
const appendToJsonFile = require('./appendAccount');

const sleep = (waitTimeInMs) => new Promise(resolve => setTimeout(resolve, waitTimeInMs));

function getRandomPassword(length) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array.from({ length }, () => charset.charAt(Math.floor(Math.random() * charset.length))).join('');
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function launchBrowserWithOptionalProxy(proxy = null) {
    const args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-zygote",
        "--disable-features=site-per-process"
    ];

    if (proxy) {
        args.push(`--proxy-server=${proxy}`);
    }

    const launchOptions = {
        headless: "new", // خليه false لو عايز تشوف المتصفح
        args: args
    };

    return puppeteer.launch(launchOptions);
}

(async function fakeInstagramAccount() {
    const proxy = process.argv[2] || null; // Pass proxy as an argument when running the script
    const browser = await launchBrowserWithOptionalProxy(proxy);
    const page = await browser.newPage();

    try {
        // Navigate to Instagram signup page
        await page.goto("https://www.instagram.com/accounts/emailsignup/", {
            waitUntil: 'networkidle2'
        });
        await sleep(5000);

        // Generate fake email
        const fakeMail = await email.getFakeMail();
        const name = await accountInfo.generatingName();
        const username = await accountInfo.username() + getRandomPassword(3);
        const randomPassword = getRandomPassword(10);

        console.log("Generated Account Info:", { fakeMail, name, username, randomPassword });

        // Fill out the signup form
        await page.type('input[name="emailOrPhone"]', fakeMail);
        await page.type('input[name="fullName"]', name);
        await page.type('input[name="username"]', username);
        await page.type('input[name="password"]', randomPassword);

        // Click the sign-up button ✅
        await page.waitForSelector('button[type="submit"]', { timeout: 10000 });
        await page.click('button[type="submit"]');
        await sleep(5000);
        
        // Select date of birth
        await page.waitForSelector('select[title="Month:"]');
        await page.waitForSelector('select[title="Day:"]');
        await page.waitForSelector('select[title="Year:"]');

        const randomMonth = getRandomInt(1, 12).toString();
        const randomDay = getRandomInt(1, 28).toString();
        const randomYear = getRandomInt(1990, 2000).toString();

        await page.select('select[title="Month:"]', randomMonth);
        await page.select('select[title="Day:"]', randomDay);
        await page.select('select[title="Year:"]', randomYear);

        console.log(`Selected Date: ${randomMonth}/${randomDay}/${randomYear}`);

        const nextClicked = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const nextButton = buttons.find(btn => btn.textContent.trim() === 'Next');
            if (nextButton) {
                nextButton.click();
                return true;
            }
            return false;
        });

        if (!nextClicked) throw new Error("Next button not found.");
        await sleep(5000);

        // Wait for the verification code input
        await page.waitForSelector('input[name="email_confirmation_code"]', { timeout: 10000 });

        // Retrieve and enter verification code
        const [mailName, domain] = fakeMail.split('@');
        const veriCode = await verifiCode.getInstCode(domain, mailName, browser);
        console.log("Verification Code:", veriCode.slice(0, 6));
        await sleep(5000);

        await page.type('input[name="email_confirmation_code"]', veriCode.slice(0, 6));
        await page.keyboard.press('Enter');

        // Wait for redirect to the main page
        const targetUrl = "https://www.instagram.com/";
        try {
            await page.waitForFunction(
                url => window.location.href === url,
                { timeout: 30000 },
                targetUrl
            );
            console.log("Page redirected to:", targetUrl);

            // Save account info to JSON file
            appendToJsonFile({
                email: fakeMail,
                name: name,
                username: username,
                password: randomPassword
            }, 'accounts.json');
        } catch (error) {
            console.error("Page did not redirect to the target URL within the timeout.");
            const pageText = await page.evaluate(() => document.body.textContent);
            console.log("Page Text:\n", pageText.trim());
        }

    } catch (error) {
        console.error("Error during account creation:", error);
    } finally {
        await browser.close();
    }
})();
