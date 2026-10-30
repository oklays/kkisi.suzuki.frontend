<?php
// In-container HTTP client for the FA-03A legacy runtime: plays a browser against the unchanged KOSIPA CI2 app on 127.0.0.1:8080.
// Keeps cookies (CI2 cookie session + CSRF cookie), adds the current CSRF token to every POST, never follows redirects (they are evidence).
// Input: JSON list of steps {method, path, form?}. Output: JSON list of {status, location, body, json}.
$steps = json_decode($argv[1], true);
$jar = array();
$out = array();
foreach ($steps as $step) {
    $method = isset($step['method']) ? $step['method'] : 'GET';
    $form = isset($step['form']) ? $step['form'] : array();
    if ($method === 'POST' && isset($jar['csrf_cookie'])) $form['csrf'] = $jar['csrf_cookie'];
    $cookie = array();
    foreach ($jar as $k => $v) $cookie[] = $k . '=' . $v;
    $headers = array('User-Agent: kfa-legacy-harness/1.0', 'Cookie: ' . implode('; ', $cookie));
    $body = '';
    if ($method === 'POST') { $body = http_build_query($form); $headers[] = 'Content-Type: application/x-www-form-urlencoded'; $headers[] = 'X-Requested-With: XMLHttpRequest'; }
    $context = stream_context_create(array('http' => array('method' => $method, 'header' => implode("\r\n", $headers), 'content' => $body, 'follow_location' => 0, 'ignore_errors' => true, 'timeout' => 30)));
    $response = @file_get_contents('http://127.0.0.1:8080' . $step['path'], false, $context);
    $status = 0; $location = null;
    foreach (isset($http_response_header) ? $http_response_header : array() as $h) {
        if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $status = (int)$m[1];
        if (preg_match('#^Location:\s*(.+)$#i', $h, $m)) $location = trim($m[1]);
        if (preg_match('#^Set-Cookie:\s*([^=]+)=([^;]*)#i', $h, $m)) { if ($m[2] === '' || $m[2] === 'deleted') unset($jar[$m[1]]); else $jar[$m[1]] = $m[2]; }
    }
    $json = json_decode($response, true);
    $out[] = array('path' => $step['path'], 'status' => $status, 'location' => $location, 'json' => $json, 'body' => $json === null ? substr((string)$response, 0, 200000) : null);
}
echo json_encode($out);
