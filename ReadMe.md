## hawtio-wiki

This plugin provides a wiki for hawtio

### Basic usage

#### Running this plugin locally

First clone the source

    git clone https://github.com/hawtio/hawtio-kubernetes.git
    cd hawtio-kubernetes

Next you'll need to [install NodeJS](http://nodejs.org/download/) and then install the default global npm dependencies:

    npm install -g bower gulp slush slush-hawtio-javascript slush-hawtio-typescript typescript

Then install all local nodejs packages and update bower dependencies via:

    npm install
    bower update

Then to run the web application:

    gulp

#### Install the bower package

`bower install --save hawtio-wiki`