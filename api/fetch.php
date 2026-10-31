<?php
// Same-origin proxy: GET api/fetch.php?url=<encoded> -> {html, finalUrl, contentType} | {error}.
// Bodies over MAX_BYTES are rejected (413), not truncated.
declare(strict_types=1);

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TOTAL_SECONDS = 10;
const JSON_FLAGS = JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES;
const BLOCKED = [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
    '192.0.0.0/24', '192.0.2.0/24', '192.88.99.0/24', '192.168.0.0/16', '198.18.0.0/15',
    '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
    '::/96', '::ffff:0:0/96', '64:ff9b::/96', '64:ff9b:1::/48', '100::/64', '2001::/23',
    '2001:db8::/32', '2002::/16', 'fc00::/7', 'fe80::/10', 'fec0::/10', 'ff00::/8',
];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function fail(int $code, string $msg): never
{
    http_response_code($code);
    echo json_encode(['error' => $msg], JSON_FLAGS);
    exit;
}

function isBlocked(string $ip): bool
{
    $bin = inet_pton($ip);
    if ($bin === false) {
        return true;
    }
    foreach (BLOCKED as $cidr) {
        [$net, $bits] = explode('/', $cidr);
        $n = inet_pton($net);
        if (strlen($n) !== strlen($bin)) {
            continue;
        }
        $full = intdiv((int)$bits, 8);
        $rem = (int)$bits % 8;
        if (substr($bin, 0, $full) !== substr($n, 0, $full)) {
            continue;
        }
        $mask = (0xFF << (8 - $rem)) & 0xFF;
        if ($rem === 0 || (ord($bin[$full]) & $mask) === (ord($n[$full]) & $mask)) {
            return true;
        }
    }
    return false;
}

/** Validate a URL and its DNS; returns the parts needed to fetch it, pinned to one safe IP. */
function target(string $url): array
{
    if (strlen($url) > 2048 || preg_match('/[\x00-\x20\x7f]/', $url)) {
        fail(400, 'Invalid URL.');
    }
    $p = parse_url($url);
    if ($p === false || !isset($p['scheme'], $p['host'])) {
        fail(400, 'Invalid URL.');
    }
    $scheme = strtolower($p['scheme']);
    if ($scheme !== 'http' && $scheme !== 'https') {
        fail(400, 'Only http and https URLs are allowed.');
    }
    if (isset($p['user']) || isset($p['pass'])) {
        fail(400, 'URLs with credentials are not allowed.');
    }
    $port = $p['port'] ?? ($scheme === 'http' ? 80 : 443);
    if ($port !== 80 && $port !== 443) {
        fail(400, 'Only ports 80 and 443 are allowed.');
    }
    $host = strtolower(trim($p['host'], '[]'));
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips = [$host];
    } else {
        if (preg_match('/[^\x00-\x7f]/', $host)) {
            $host = function_exists('idn_to_ascii') ? (string)idn_to_ascii($host) : '';
        }
        // A numeric or 0x last label would be read by curl as an IP (127.1, 2130706433).
        if (!preg_match('/^[a-z0-9_]([a-z0-9_.-]*[a-z0-9_])?$/', $host)
            || preg_match('/(^|\.)(0x[0-9a-f]*|\d+)$/', $host)) {
            fail(400, 'Invalid host name.');
        }
        $ips = [];
        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) {
            $ips[] = $r['ip'] ?? $r['ipv6'] ?? '';
        }
        if (!$ips) {
            $ips = @gethostbynamel($host) ?: [];
        }
        if (!$ips) {
            fail(502, 'Could not resolve the host name.');
        }
    }
    foreach ($ips as $ip) {
        if (isBlocked($ip)) {
            fail(403, 'That address is not allowed.');
        }
    }
    $isV6 = str_contains($host, ':');
    $hostPart = $isV6 ? "[$host]" : $host;
    $pinIp = $isV6 || str_contains($ips[0], ':') ? "[{$ips[0]}]" : $ips[0];
    return [
        'scheme' => $scheme,
        'authority' => $hostPart . (isset($p['port']) ? ':' . $port : ''),
        'path' => ($p['path'] ?? '/') . (isset($p['query']) ? '?' . $p['query'] : ''),
        'resolve' => filter_var($host, FILTER_VALIDATE_IP) ? [] : ["$host:$port:$pinIp"],
    ];
}

function mimeOf(string $contentType): string
{
    return strtolower(trim(explode(';', $contentType)[0]));
}

function mimeOk(string $contentType): bool
{
    return in_array(mimeOf($contentType), ['text/html', 'text/plain'], true);
}

/** Resolve a Location header against the current target. shortcut: no dot-segment removal, curl/servers normalise. */
function absolute(array $t, string $loc): string
{
    if (preg_match('#^[a-z][a-z0-9+.-]*:#i', $loc)) {
        return $loc;
    }
    if (str_starts_with($loc, '//')) {
        return $t['scheme'] . ':' . $loc;
    }
    $base = $t['scheme'] . '://' . $t['authority'];
    if (str_starts_with($loc, '/')) {
        return $base . $loc;
    }
    $path = explode('?', $t['path'])[0];
    return $base . substr($path, 0, (int)strrpos($path, '/') + 1) . $loc;
}

function toUtf8(string $body, string $contentType): string
{
    $cs = null;
    if (preg_match('/charset\s*=\s*["\']?([\w:.\-]+)/i', $contentType, $m)
        || preg_match('/<meta[^>]+charset\s*=\s*["\']?\s*([\w:.\-]+)/i', substr($body, 0, 8192), $m)) {
        $cs = strtolower($m[1]);
    }
    if ($cs === null || $cs === 'utf-8' || $cs === 'utf8') {
        return $body;
    }
    if (in_array($cs, ['iso-8859-1', 'latin1', 'us-ascii', 'ascii'], true)) {
        $cs = 'windows-1252'; // WHATWG label mapping
    }
    try {
        return mb_convert_encoding($body, 'UTF-8', $cs);
    } catch (ValueError) {
        return $body; // unknown charset: assume UTF-8
    }
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    fail(405, 'Only GET is allowed.');
}
if (in_array($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '', ['cross-site', 'same-site'], true)) {
    fail(403, 'Cross-site requests are not allowed.');
}
if (isset($_SERVER['HTTP_ORIGIN'])
    && !preg_match('#^(https://(www\.)?danielpradilla\.info|http://(127\.0\.0\.1|localhost):\d+)$#', $_SERVER['HTTP_ORIGIN'])) {
    fail(403, 'Cross-origin requests are not allowed.');
}
$url = $_GET['url'] ?? null;
if (!is_string($url) || $url === '') {
    fail(400, 'Missing url parameter.');
}

$deadline = microtime(true) + TOTAL_SECONDS;
for ($hop = 0; $hop <= MAX_REDIRECTS; $hop++) {
    $t = target($url);
    $ms = (int)(($deadline - microtime(true)) * 1000);
    if ($ms < 100) {
        fail(504, 'Timed out.');
    }
    $status = 0;
    $loc = null;
    $ct = '';
    $body = '';
    $why = '';
    // body-size and mime aborts are reported through $why
    $ch = curl_init($t['scheme'] . '://' . $t['authority'] . $t['path']);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_RESOLVE => $t['resolve'],
        CURLOPT_TIMEOUT_MS => $ms,
        CURLOPT_CONNECTTIMEOUT_MS => min(5000, $ms),
        CURLOPT_ENCODING => '', // size cap below applies to the decompressed bytes
        CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; Mozilla/5.0; +https://www.danielpradilla.info/)',
        CURLOPT_HTTPHEADER => ['Accept: text/html,text/plain'],
        CURLOPT_HEADERFUNCTION => function ($ch, string $h) use (&$status, &$loc, &$ct): int {
            $l = trim($h);
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $l, $m)) {
                [$status, $loc, $ct] = [(int)$m[1], null, ''];
            } elseif (($i = strpos($l, ':')) !== false) {
                $name = strtolower(substr($l, 0, $i));
                $val = trim(substr($l, $i + 1));
                if ($name === 'location') {
                    $loc = $val;
                } elseif ($name === 'content-type') {
                    $ct = $val;
                }
            }
            return strlen($h);
        },
        CURLOPT_WRITEFUNCTION => function ($ch, string $d) use (&$status, &$ct, &$body, &$why): int {
            if ($status < 200 || $status >= 300) {
                $why = 'status';
                return 0;
            }
            // (status/type are checked per chunk; headers have all arrived before the first body byte)
            if (!mimeOk($ct)) {
                $why = 'type';
                return 0;
            }
            if (strlen($body) + strlen($d) > MAX_BYTES) {
                $why = 'size';
                return 0;
            }
            $body .= $d;
            return strlen($d);
        },
    ]);
    $ok = curl_exec($ch);
    $errno = curl_errno($ch);

    if ($why === 'size') {
        fail(413, 'The page is larger than 3 MB.');
    }
    if ($why === 'type') {
        fail(415, 'Only text/html and text/plain pages are supported.');
    }
    if ($why !== 'status' && $ok === false) {
        $errno === CURLE_OPERATION_TIMEDOUT ? fail(504, 'Timed out.') : fail(502, 'Could not fetch the page.');
    }
    if ($status >= 300 && $status < 400 && $loc !== null && $loc !== '') {
        $url = absolute($t, $loc);
        continue;
    }
    if ($status < 200 || $status >= 300) {
        fail(502, "The page returned HTTP $status.");
    }
    if (!mimeOk($ct)) {
        fail(415, 'Only text/html and text/plain pages are supported.');
    }
    $json = json_encode([
        'html' => toUtf8($body, $ct),
        'finalUrl' => $t['scheme'] . '://' . $t['authority'] . $t['path'],
        'contentType' => $ct,
    ], JSON_FLAGS);
    if ($json === false) {
        fail(500, 'Could not encode the page.');
    }
    echo $json;
    exit;
}
fail(502, 'Too many redirects.');
