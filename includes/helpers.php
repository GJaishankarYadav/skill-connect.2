<?php
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')]);
if (session_status() === PHP_SESSION_NONE) session_start();

function e($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
function redirect($path) { header('Location: ' . $path); exit; }
function flash($key, $value = null) {
    if ($value !== null) { $_SESSION['flash'][$key] = $value; return; }
    $value = $_SESSION['flash'][$key] ?? null;
    unset($_SESSION['flash'][$key]);
    return $value;
}
function csrf_token() {
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}
function csrf_verify() {
    if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) {
        http_response_code(419); die('Invalid security token. Refresh the page and try again.');
    }
}
function admin_required() {
    if (empty($_SESSION['admin_id'])) redirect('index.php?page=login');
}
function post_string($key, $max = 255) { return trim((string)($_POST[$key] ?? '')); }
