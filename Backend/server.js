const express = require('express');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());


const urlDatabase = new Map();
const analyticsDatabase = new Map();


const logRequest = (req, res, next) => {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const ip = req.ip || req.connection.remoteAddress;
    
    console.log(`[${timestamp}] ${method} ${url} - IP: ${ip}`);
    next();
};

app.use(logRequest);


const generateShortCode = (customCode = null) => {
    if (customCode) {
        
        if (/^[a-zA-Z0-9]{3,10}$/.test(customCode)) {
            return customCode;
        }
        throw new Error('Invalid custom shortcode format');
    }
    
   
    return crypto.randomBytes(3).toString('hex');
};


const isValidUrl = (string) => {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
};


app.post('/shorturls', (req, res) => {
    try {
        const { url, validity, shortcode } = req.body;
        
        
        if (!url) {
            return res.status(400).json({
                error: 'URL is required',
                code: 'MISSING_URL'
            });
        }
        
        
        if (!isValidUrl(url)) {
            return res.status(400).json({
                error: 'Invalid URL format',
                code: 'INVALID_URL'
            });
        }
        
       
        const validityMinutes = validity || 30;
        const expiryTime = new Date(Date.now() + (validityMinutes * 60 * 1000));
        
        
        let finalShortCode;
        try {
            finalShortCode = generateShortCode(shortcode);
        } catch (error) {
            return res.status(400).json({
                error: error.message,
                code: 'INVALID_SHORTCODE'
            });
        }
        

        if (urlDatabase.has(finalShortCode)) {
            return res.status(409).json({
                error: 'Shortcode already exists',
                code: 'SHORTCODE_COLLISION'
            });
        }
        
        
        const urlData = {
            originalUrl: url,
            shortCode: finalShortCode,
            createdAt: new Date().toISOString(),
            expiryTime: expiryTime.toISOString(),
            clickCount: 0
        };
        
        urlDatabase.set(finalShortCode, urlData);
        
        
        analyticsDatabase.set(finalShortCode, {
            clicks: [],
            totalClicks: 0,
            createdAt: urlData.createdAt,
            originalUrl: url,
            expiryTime: urlData.expiryTime
        });
        
        
        const shortenedUrl = `http://localhost:${PORT}/${finalShortCode}`;
        
        
        res.status(201).json({
            shortLink: shortenedUrl,
            expiry: expiryTime.toISOString()
        });
        
    } catch (error) {
        console.error('Error creating short URL:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

app.get('/:shortcode', (req, res, next) => {
    try {
        const { shortcode } = req.params;
        
        
        if (shortcode === 'shorturls' || shortcode === 'health') {
            return next();
        }
        
        
        const urlData = urlDatabase.get(shortcode);
        if (!urlData) {
            return res.status(404).json({
                error: 'Short URL not found',
                code: 'NOT_FOUND'
            });
        }
        
        
        const now = new Date();
        const expiry = new Date(urlData.expiryTime);
        if (now > expiry) {
            return res.status(410).json({
                error: 'Short URL has expired',
                code: 'EXPIRED_LINK'
            });
        }
        
        const clickData = {
            timestamp: new Date().toISOString(),
            userAgent: req.get('User-Agent') || 'Unknown',
            referrer: req.get('Referer') || 'Direct',
            ip: req.ip || req.connection.remoteAddress || 'Unknown'
        };
        
       
        urlData.clickCount += 1;
        urlDatabase.set(shortcode, urlData);
        
        
        const analytics = analyticsDatabase.get(shortcode);
        analytics.clicks.push(clickData);
        analytics.totalClicks += 1;
        analyticsDatabase.set(shortcode, analytics);
        
        
        res.redirect(302, urlData.originalUrl);
        
    } catch (error) {
        console.error('Error handling redirect:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});


app.get('/shorturls/:shortcode', (req, res) => {
    try {
        const { shortcode } = req.params;
        

        const analytics = analyticsDatabase.get(shortcode);
        if (!analytics) {
            return res.status(404).json({
                error: 'Short URL not found',
                code: 'NOT_FOUND'
            });
        }
        
        
        const detailedClicks = analytics.clicks.map(click => ({
            timestamp: click.timestamp,
            source: click.referrer,
            userAgent: click.userAgent,
            location: 'Unknown' 
        }));
        
       
        res.json({
            totalClicks: analytics.totalClicks,
            originalUrl: analytics.originalUrl,
            creationDate: analytics.createdAt,
            expiryDate: analytics.expiryTime,
            detailedClickData: detailedClicks
        });
        
    } catch (error) {
        console.error('Error retrieving statistics:', error);
        res.status(500).json({
            error: 'Internal server error',
            code: 'INTERNAL_ERROR'
        });
    }
});

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'URL Shortener Microservice'
    });
});


app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
    });
});


app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND'
    });
});
app.listen(PORT, () => {
    console.log(`URL Shortener Microservice running on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`API Base URL: http://localhost:${PORT}`);
    console.log(`Ready to accept requests!`);
});

module.exports = app;