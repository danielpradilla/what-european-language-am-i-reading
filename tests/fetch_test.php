<?php
// Usage: php tests/fetch_test.php http://127.0.0.1:8790/api/fetch.php
// Start the server yourself: php -S 127.0.0.1:8790 -t <repo>. Needs network access.
declare(strict_types=1);

$base = $argv[1] ?? null;
if (!$base) {
    fwrite(STDERR, "Usage: php tests/fetch_test.php <endpoint-url>\n");
    exit(2);
}
$origin = preg_replace('#^(https?://[^/]+).*#', '$1', $base);
$fails = 0;

function call(string $base, string $target, array $headers = [], string $method = 'GET'): array
{
    $ch = curl_init($base . '?url=' . rawurlencode($target));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => $headers, CURLOPT_CUSTOMREQUEST => $method]);
    $raw = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    return [$code, json_decode((string)$raw, true) ?? []];
}

function check(string $name, bool $ok, string $detail = ''): void
{
    global $fails;
    echo ($ok ? 'PASS' : 'FAIL') . "  $name" . ($ok ? '' : "  ($detail)") . "\n";
    $fails += $ok ? 0 : 1;
}

foreach ([
    'file:///etc/passwd', 'ftp://example.com', 'http://127.0.0.1/', 'http://[::1]/',
    'http://169.254.169.254/', 'http://10.0.0.1/', 'http://100.64.0.1/', 'http://[::ffff:127.0.0.1]/',
    'http://127.1/', 'http://2130706433/', 'http://user:pw@example.com/', 'http://example.com:8080/',
    'http://localtest.me/', 'http://127.0.0.1.nip.io/',
] as $u) {
    [$code, $j] = call($base, $u, ["Origin: $origin"]);
    check("rejects $u", $code >= 400 && isset($j['error']) && !isset($j['html']), "status $code " . json_encode($j));
}

[$code, $j] = call($base, 'https://example.com/', ['Origin: https://evil.example']);
check('rejects cross-site Origin', $code === 403 && isset($j['error']), "status $code");
[$code, $j] = call($base, 'https://example.com/', ['Sec-Fetch-Site: cross-site']);
check('rejects Sec-Fetch-Site: cross-site', $code === 403, "status $code");
[$code] = call($base, 'https://example.com/', [], 'POST');
check('rejects POST', $code === 405, "status $code");

[$code, $j] = call($base, 'https://example.com/', ["Origin: $origin", 'Sec-Fetch-Site: same-origin']);
check('accepts https://example.com/', $code === 200 && str_contains($j['html'] ?? '', 'Example Domain')
    && ($j['contentType'] ?? '') !== '' && ($j['finalUrl'] ?? '') !== '', "status $code " . json_encode($j));

[$code, $j] = call($base, 'https://en.wikipedia.org/wiki/Europe', ["Origin: $origin"]);
check('accepts a Wikipedia page', $code === 200 && str_contains($j['html'] ?? '', 'Europe'), "status $code");

[$code, $j] = call($base, 'https://httpbingo.org/redirect-to?url=http%3A%2F%2Fexample.com%3A8080%2F', ["Origin: $origin"]);
check('re-validates redirect hop (port)', $code === 400 && str_contains($j['error'] ?? '', 'ports'), "status $code " . json_encode($j));

exit($fails ? 1 : 0);
