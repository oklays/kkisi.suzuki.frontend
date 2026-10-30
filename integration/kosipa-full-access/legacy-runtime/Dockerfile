# EOL runtime exclusively for isolated KOSIPA compatibility characterization (FA-03A). Never deploy.
# Same pinned PHP 5.6 base as integration/public-savings/legacy-runtime; the real CodeIgniter 2.1.4 framework of the local KOSIPA copy
# runs unchanged on top of it (mysqli driver, PHP built-in web server). The container only ever joins an --internal network.
FROM php:5.6.40-cli@sha256:6ce95208609dc66df163ab936c970b3b34cd901b85c747102c5999f08ade9143
RUN docker-php-ext-install mysqli mysql >/dev/null
WORKDIR /app
