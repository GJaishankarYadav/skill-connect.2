<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= e($pageTitle ?? 'SkillConnect') ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body>
<header class="topbar"><div class="container nav"><a class="brand" href="index.php"><span class="brand-mark">SC</span><span>SkillConnect</span></a>
<button class="menu-toggle" aria-label="Menu">☰</button>
<nav class="navlinks"><a href="index.php">Home</a><a href="index.php?page=workshops">Workshops</a><a href="index.php?page=about">About</a><a href="index.php?page=contact">Contact</a><?php if(!empty($_SESSION['admin_id'])): ?><a href="index.php?page=admin">Dashboard</a><a href="index.php?page=logout">Logout</a><?php else: ?><a class="nav-login" href="index.php?page=login">Admin Login</a><?php endif; ?></nav></div></header>
<main>
<?php if($message=flash('success')): ?><div class="container"><div class="alert success"><?= e($message) ?></div></div><?php endif; ?>
<?php if($message=flash('error')): ?><div class="container"><div class="alert error"><?= e($message) ?></div></div><?php endif; ?>
