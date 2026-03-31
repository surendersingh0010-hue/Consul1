module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: 'ANTHROPIC_API_KEY not set in Vercel Environment Variables.' }
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }

  // Agentic loop — handles web search tool use automatically
  let messages = body.messages || [];
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, messages }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // If stop_reason is end_turn or no tool use — return final response
    if (data.stop_reason === 'end_turn' || !data.content) {
      return res.status(200).json(data);
    }

    // Check if any tool_use blocks exist
    const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
    if (toolUseBlocks.length === 0) {
      return res.status(200).json(data);
    }

    // Add assistant message with tool use to messages
    messages = [...messages, { role: 'assistant', content: data.content }];

    // Build tool results — web_search results are returned by the API itself
    // We just need to pass them back as tool_result blocks
    const toolResults = toolUseBlocks.map(block => ({
      type: 'tool_result',
      tool_use_id: block.id,
      content: block.input ? JSON.stringify(block.input) : '',
    }));

    messages = [...messages, { role: 'user', content: toolResults }];
  }

  // Fallback — return last response
  return res.status(200).json({ content: [{ type: 'text', text: 'Search completed.' }] });
};
