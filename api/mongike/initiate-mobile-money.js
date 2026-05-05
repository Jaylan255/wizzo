const API_BASE_URL = 'https://mongike.com/api/v1';
const MONGIKE_API_KEY = process.env.MONGIKE_API_KEY || 'mk_781889e12f282463b72964c518a4519cc4668acad42faa07';

const readJsonBody = async (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch (error) {
    return {};
  }
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ status: 'error', message: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const {
      order_id,
      amount,
      buyer_phone,
      buyer_name,
      buyer_email,
      fee_payer = 'MERCHANT',
      metadata = {}
    } = body || {};

    if (!order_id || !amount || !buyer_phone) {
      res.status(400).json({
        status: 'error',
        message: 'order_id, amount and buyer_phone are required.'
      });
      return;
    }

    if (!MONGIKE_API_KEY) {
      res.status(500).json({
        status: 'error',
        message: 'MONGIKE_API_KEY is missing on the server.'
      });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const webhook_url = host ? `${protocol}://${host}/api/mongike/webhook` : undefined;

    const upstreamResponse = await fetch(`${API_BASE_URL}/payments/mobile-money/tanzania`, {
      method: 'POST',
      headers: {
        'x-api-key': MONGIKE_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        order_id,
        amount,
        buyer_phone,
        buyer_name,
        buyer_email,
        fee_payer,
        metadata,
        ...(webhook_url ? { webhook_url } : {})
      })
    });

    const text = await upstreamResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      data = {
        status: upstreamResponse.ok ? 'success' : 'error',
        message: text || 'Unexpected Mongike response'
      };
    }

    if (!upstreamResponse.ok) {
      res.status(upstreamResponse.status).json({
        ...data,
        upstreamStatus: upstreamResponse.status
      });
      return;
    }

    res.status(upstreamResponse.status).json(data);
  } catch (error) {
    console.error('Mongike initiate mobile money error:', error);
    res.status(500).json({
      status: 'error',
      message: error?.message || 'Failed to initiate mobile money payment.'
    });
  }
};
