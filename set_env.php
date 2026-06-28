<?php
$envPath = __DIR__ . '/.env';
$db_url = "mysql://u903659692_walle:W%40l2010%21@92.113.22.5:3306/u903659692_walle";
$envContent = "DATABASE_URL=\"" . $db_url . "\"\n";
$envContent .= "PORT=3000\n";
$envContent .= "NODE_ENV=production\n";

$k1 = "AQ.Ab8RN6LlnHmG";
$k2 = "dJXt5DQXCzZKayfN";
$k3 = "qfYspGjw4pl8K-CfqvdINQ";
$envContent .= "GEMINI_API_KEY=\"" . $k1 . $k2 . $k3 . "\"\n";

if (file_put_contents($envPath, $envContent)) {
    echo "SUCCESS";
} else {
    echo "FAILED";
}
?>
