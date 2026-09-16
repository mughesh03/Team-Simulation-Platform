require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors()); // Allows your frontend website to safely communicate with this backend
app.use(express.json());

// Endpoint for your website to call
app.post('/api/chat', async (req, res) => {
    try {
        const userMessages = req.body.messages;

        const response = await axios.post('https://virginia.edu', {
            model: "kimi-k2.5", // Explicitly targeting the Kimi K2.5 model
            messages: userMessages
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.UVA_RC_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error calling UVA RC:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to communicate with Kimi K2.5 API' });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend secure proxy running on port ${PORT}`));
