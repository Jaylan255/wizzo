<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status' => 'error',
        'message' => 'Method not allowed'
    ]);
    exit;
}

$rawInput = file_get_contents('php://input');
$body = json_decode($rawInput, true);

if (!is_array($body)) {
    $body = [];
}

$orderId = $body['order_id'] ?? '';
$amount = $body['amount'] ?? '';
$buyerPhone = $body['buyer_phone'] ?? '';
$buyerName = $body['buyer_name'] ?? '';
$buyerEmail = $body['buyer_email'] ?? '';
$feePayer = $body['fee_payer'] ?? 'MERCHANT';
$metadata = $body['metadata'] ?? [];

if ($orderId === '' || $amount === '' || $buyerPhone === '') {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'order_id, amount and buyer_phone are required.'
    ]);
    exit;
}

$apiKey = getenv('MONGIKE_API_KEY');
if (!$apiKey) {
    $apiKey = 'mk_781889e12f282463b72964c518a4519cc4668acad42faa07';
}

if (!$apiKey) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'MONGIKE_API_KEY is missing on the server.'
    ]);
    exit;
}

$isHttps = (
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
    (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
);
$scheme = $isHttps ? 'https' : 'http';
$host = $_SERVER['HTTP_HOST'] ?? '';
$webhookUrl = $host ? $scheme . '://' . $host . '/api/mongike/webhook.php' : null;

$payload = [
    'order_id' => $orderId,
    'amount' => $amount,
    'buyer_phone' => $buyerPhone,
    'buyer_name' => $buyerName,
    'buyer_email' => $buyerEmail,
    'fee_payer' => $feePayer,
    'metadata' => $metadata
];

if ($webhookUrl) {
    $payload['webhook_url'] = $webhookUrl;
}

$ch = curl_init('https://mongike.com/api/v1/payments/mobile-money/tanzania');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        'x-api-key: ' . $apiKey,
        'Content-Type: application/json'
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_TIMEOUT => 60
]);

$responseBody = curl_exec($ch);
$curlError = curl_error($ch);
$statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($responseBody === false) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $curlError ?: 'Failed to initiate mobile money payment.'
    ]);
    exit;
}

$decoded = json_decode($responseBody, true);
if (!is_array($decoded)) {
    $decoded = [
        'status' => $statusCode >= 200 && $statusCode < 300 ? 'success' : 'error',
        'message' => $responseBody ?: 'Unexpected Mongike response'
    ];
}

http_response_code($statusCode > 0 ? $statusCode : 200);
echo json_encode($decoded);
