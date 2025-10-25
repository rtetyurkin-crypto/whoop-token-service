const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'whoop-token-refresh' });
});

// Auto refresh - делает ВСЁ сам!
app.get('/auto-refresh', async (req, res) => {
  try {
    console.log('Starting auto-refresh...');

    // 1. Читаем токен из Supabase
    const { data: tokenData, error: fetchError } = await supabase
      .from('whoop_tokens')
      .select('*')
      .eq('user_id', 20260404)
      .single();

    if (fetchError) {
      console.error('Error fetching token:', fetchError);
      return res.status(500).json({ error: 'Failed to fetch token from database' });
    }

    console.log('Token fetched from Supabase');

    // 2. Обновляем через Whoop API
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.WHOOP_CLIENT_ID,
      client_secret: process.env.WHOOP_CLIENT_SECRET,
      scope: 'offline',
      refresh_token: tokenData.refresh_token
    });

    const whoopResponse = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const newTokens = await whoopResponse.json();

    if (!whoopResponse.ok) {
      console.error('Whoop API error:', newTokens);
      return res.status(whoopResponse.status).json(newTokens);
    }

    console.log('New tokens received from Whoop');

    // 3. Сохраняем обратно в Supabase
    const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000).toISOString();

    const { error: updateError } = await supabase
      .from('whoop_tokens')
      .update({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', 20260404);

    if (updateError) {
      console.error('Error updating Supabase:', updateError);
      return res.status(500).json({ error: 'Failed to update database' });
    }

    console.log('Tokens saved to Supabase');

    res.json({ 
      success: true, 
      message: 'Tokens refreshed successfully',
      expires_at: expiresAt
    });

  } catch (error) {
    console.error('Auto-refresh error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual refresh endpoint (оставляем для тестов)
app.post('/refresh-token', async (req, res) => {
  try {
    const { refresh_token, client_id, client_secret } = req.body;

    if (!refresh_token || !client_id || !client_secret) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: client_id,
      client_secret: client_secret,
      scope: 'offline',
      refresh_token: refresh_token
    });

    const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
