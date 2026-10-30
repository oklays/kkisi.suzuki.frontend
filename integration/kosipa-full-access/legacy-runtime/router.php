<?php
// PHP built-in server router: existing files are served as-is, everything else goes through the unchanged legacy front controller.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path !== '/' && is_file('/app' . $path)) return false;
$_SERVER['SCRIPT_NAME'] = '/index.php';
$_SERVER['SCRIPT_FILENAME'] = '/app/index.php';
chdir('/app');
require '/app/index.php';
