# EOL runtime exclusively for isolated compatibility characterization. Never deploy.
FROM php:5.6.40-cli@sha256:6ce95208609dc66df163ab936c970b3b34cd901b85c747102c5999f08ade9143
RUN docker-php-ext-install pdo_mysql
WORKDIR /harness
ENTRYPOINT ["php", "-d", "display_errors=0", "-d", "log_errors=0", "/harness/run.php"]
