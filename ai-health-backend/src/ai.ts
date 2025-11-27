// Replacing DeepSeek API call with Groq GPT OSS120B

import axios from 'axios';

const GROC_GPT_API_URL = 'https://api.groq.gpt/oss120b';

async function fetchAIResponse(input) {
    try {
        const response = await axios.post(GROC_GPT_API_URL, {
            data: input,
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching AI response:', error);
        throw error;
    }
}

export default fetchAIResponse;