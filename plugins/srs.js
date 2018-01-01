// srs

// documentation via: haraka -c /Users/tmillar/dev/repo/haraka-test -h plugins/srs

// Put your plugin code here
// type: `haraka -h Plugins` for documentation on how to create a plugin
'use strict';

const Address = require('address-rfc2821').Address;
const MongoClient = require('mongodb').MongoClient;
const async = require('async');
const config = {};
const emailExp = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/i;

var sendEmail = function(from, tos, tx, loginfo, cb) {

    if(tos.constructor.name.toLowerCase() === 'string') {
        tos = [tos];
    }
    
    if(!tos || tos.length < 1 || !emailExp.test(tos[0]) || !emailExp.test(from)){
        return cb('tos or from are not valid emails')
    }
    // just handle one email for now
    var to = tos[0];

    tx.remove_header('from');
    tx.add_header('from', from);
    tx.remove_header('to');
    tx.add_header('to', to);

    //tx.rcpt_to.pop();
    tx.rcpt_to = [];

    for(var i = 0; i < tos.length; i++) {
        tx.rcpt_to.push(new Address(to));
    }
    tx.mail_from = new Address(from);

    /*var received = connection.transaction.header.headers_decoded.received;
     for(var i = 0; i < received.length; i++){
     received[i] = received[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
     'noreply@domain.com');
     }
     connection.transaction.header.headers.received = received;
     */

    var list = tx.header.header_list;
    for(var i = 0; i < list.length; i++){
        if(list[i].startsWith('Received:')) {
            list[i] = list[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
                'noreply@manwithacalculator.com');
        }
    }
    tx.header.header_list = list;

    loginfo("RECEIVED " + JSON.stringify(tx.received, null, 2));

    var keys = Object.getOwnPropertyNames(tx);
    for (var i = keys.length - 1; i >= 0; i--) {
        loginfo(keys[i] + " - " + tx[keys[i]]);
    }

    loginfo("MAIL FROM " + tx.mail_from.address());
    loginfo("RCPT TO " + tx.rcpt_to);
    loginfo("DETAILS " + JSON.stringify(tx.header, null, 2));

    return cb();
};

exports.register = function () {
    const plugin = this;
    plugin.load_errs = [];

    plugin.load_srs_ini();

    if (plugin.load_errs.length > 0) return;

    //plugin.register_hook('queue', 'queue_forward');

};

exports.load_srs_ini = function () {
    const plugin = this;

    var p = plugin.config;

    plugin.cfg = plugin.cfg || {};

    plugin.cfg.srs = p.get('srs.ini', {},
        function () {
            plugin.load_srs_ini();
        });


};

exports.hook_queue = function (next, connection) {
    const plugin = this;

    config.srs = { domain: plugin.cfg.srs.main.domain };

    if(!/^[\w]{1,61}\.[\w]{2,}$/.test(config.srs.domain)){
        throw new Error('Must set a valid domain in srs.ini');
    }

    config.srs.domain = config.srs.domain.toLowerCase();

    config.srs.match = {
        external: plugin.cfg.srs.main.match_external,
        internal: plugin.cfg.srs.main.match_internal,
        slug: plugin.cfg.srs.main.match_slug
    };

    if(emailExp.test(plugin.cfg.srs.main.funnel_email)) {
        config.srs.funnel = plugin.cfg.srs.main.funnel_email;
    }

    config.db = {};
    config.db = {
        username: plugin.cfg.srs.main.username || '',
        password: plugin.cfg.srs.main.password || '',
        host: plugin.cfg.srs.main.host || 'localhost',
        name: plugin.cfg.srs.main.db || 'myDb',
        port: plugin.cfg.srs.main.port || 27017,
        host2: plugin.cfg.srs.main.host2,
        port2: plugin.cfg.srs.main.port2,
        host3: plugin.cfg.srs.main.host3,
        port3: plugin.cfg.srs.main.port3,
        replset: plugin.cfg.srs.main.replset,
        ssl: plugin.cfg.srs.main.ssl,
        collection: plugin.cfg.srs.main.collection
    };

    var credentials = (config.db.username && config.db.password)
        ? config.db.username + ':' + config.db.password + '@'
        : '';

    config.db.url = 'mongodb://' + credentials + config.db.host + ':' + config.db.port;

    if(config.db.host2 && config.db.port2) {
        config.db.url += ',' + config.db.host2 +':' + config.db.port2;
    }

    if(config.db.host3 && config.db.port3) {
        config.db.url += ',' + config.db.host3 +':' + config.db.port3;
    }

    config.db.url = config.db.url + '/' + config.db.name;

    if(config.db.replset){
        config.db.url += '?replicaSet=' + config.db.replset + '&w=1';
    }

    if(config.db.ssl && config.db.ssl == 'true') {

        if (config.db.url.indexOf('?') > -1) {
            config.db.url += '&ssl=true';
        } else {
            config.db.url += '?ssl=true';
        }
    }

    //todo get id from email
    var from = connection.transaction.mail_from;
    var tos = connection.transaction.rcpt_to;

    if(!from || !tos || tos.length < 1) {
        throw new Error('no from or tos');
    }

    var todos = {
        from: null,
        to: []
    };
    var clean_tos = [];
    var clean_from;

    var client;

    async.series([
        function(cb) {

            if (!from || from.host.toLowerCase() !== config.srs.domain) {
                // incoming email is not from the domain
                todos.from = from.user + '@' + from.host;
            }

            clean_from = from.user + '@' + from.host;
            return cb();
        },

        function(cb){

            async.each(tos, function(to, done) {

                if(!to || to.host.toLowerCase() !== config.srs.domain) {
                    //To is not from this domain
                    todos.to.push(to.user + '@' + to.host);
                }

                clean_tos.push(to.user + '@' + to.host);
                return done();

            }, function(err){ return cb(err); });

        },

        function(cb) {

            if(!todos.from && todos.to.length < 1) return cb(true);
            return cb();
        },

        function(cb) {

            MongoClient.connect(config.db.url, function (err, c) {

                client = c;
                return cb(err);

            });
        },
        
        function(cb) {

            var regExternal = new RegExp(config.srs.match.external, "i");
            var regInternal = new RegExp(config.srs.match.internal, "i");
            var regSlug = new RegExp(config.srs.match.slug, "i");
            var slugs = [];

            /*if (regExternal.test(clean_from)) {

                //From can never be an alias email
                return cb('Emails can not originate from alias emails');

                var slug = {
                    type: 'from',
                    value: regSlug.exec(clean_from)[0]
                };
                slugs.push(slug);
            }*/

            for (var i = 0; i < clean_tos.length; i++) {
                if (regInternal.test(clean_tos[i]) && regSlug.test(clean_tos[i])) {
                    var slug = {
                        type: 'to',
                        direction: 'internal',
                        value: regSlug.exec(clean_tos[i])[0]
                    };
                    slugs.push(slug);

                    //Break will just add the one Alias emails to the collection of tos
                    break;
                }

                if (regExternal.test(clean_tos[i]) && regSlug.test(clean_tos[i])) {
                    var slug = {
                        type: 'to',
                        direction: 'external',
                        value: regSlug.exec(clean_tos[i])[0]
                    };
                    slugs.push(slug);

                    //Break will just add the one Alias emails to the collection of tos
                    break;
                }
            }

            if (slugs.length > 1) {
                var prev = slugs[0];
                for (var i = 1; i < slugs.length; i++) {
                    if(prev.value !== slugs[i].value){
                        //Shouldn't have two different email slugs
                        return cb('Shouldn\'t have two different email slugs');
                    }
                    prev[i] = slugs[i];
                }
            }

            //fetch connection using slug
            if(slugs.length === 1){

                if(slugs[0].type !== 'to'){
                    return cb('Slugs are not TOs');
                }

                var slug = slugs[0].value.toLowerCase(); // any slug will do since they are the same
                var direction = slugs[0].direction;
                var db = client.db(config.db.name);
                var collection = db.collection(config.db.collection);
                var users = db.collection('users');
                var bookkeepers = db.collection('bookkeepers');
                var communication;
                var bk, user;

                async.series([

                    function(cb2) {

                        collection.findOne({
                            slug: slug
                        }, function (err, result) {
                            communication = result;
                            return cb2(err);
                        });
                    },

                    function(cb2) {

                        if(!communication) {
                            return cb2('slug ' + slug + ' doesn\'t match any records');
                        }

                        bookkeepers.findOne({
                            _id: communication.bookkeeper
                        }, function (err, result) {
                            bk = result;
                            return cb2(err);
                        });

                    },

                    function(cb2) {

                        users.findOne({
                            _id: communication.user
                        }, function (err, result) {
                            user = result;
                            return cb2(err);
                        });

                    }

                ], function(err){
                    if(err) {
                        return cb(err);
                    }

                    if(!user || !bk) {
                        return cb('Email used alias but no user/bk were found.');
                    }

                    switch(direction){

                        // To Client
                        case 'external':
                            var from = 'bk-' + slug + '@' + config.srs.domain;
                            sendEmail(from, user.email, connection.transaction, connection.loginfo, cb);
                            break;

                        // To BK
                        case 'internal':
                            var from = 'client-' + slug + '@' + config.srs.domain;
                            sendEmail(from, bk.email, connection.transaction, connection.loginfo, cb);
                            break;
                    }

                });

            } else {

                if(config.srs.funnel) {
                    for (var i = 0; i < tos.length; i++) {
                        if (tos[i].host.toLowerCase() === config.srs.domain) {
                            return sendEmail(clean_from, config.srs.funnel, connection.transaction, connection.loginfo, cb);
                        }

                    }
                }
                return cb();
            }
        }

        /*function(cb) {

            // Client (own email) > BK
            if(todos.from && todos.to.length > 0) {
                for (var i = 0; i < todos.to.length; i++) {
                    if(!(new RegExp(config.srs.match.to)).test(todos.to[i])) {
                        // CLIENT -> BK
                    }
                    else if(!(new RegExp(config.srs.match.from)).test(todos.to[i])) {
                        // BK -> CLIENT
                    }
                }
            }

            return cb();
        },

        function(cb) {

            var db = client.db(config.db.name);
            var collection = db.collection(config.db.collection);
            var users = db.collection('users');

            var fromUser, toUsers = [];
            
            async.series([

                function(cb2) {

                    if(!from) return cb2();

                    users.findOne({
                        email: new RegExp(from, 'i')
                    }, function (err, result) {
                        fromUser = result;
                        return cb2(err);
                    });
                }

            ], function(err){ return cb(err); });

        }*/

    ], function(err){
        if(client) {
            client.close();
        }
        
        if(err === true) {
            err = null;
        }

        var list = connection.transaction.header.header_list;
        for(var i = 0; i < list.length; i++){
            if(list[i].startsWith('Received:')) {
                list[i] = list[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
                    'noreply@manwithacalculator.com');
            }
        }
        //connection.transaction.header.header_list = list;


        var keys = Object.getOwnPropertyNames(connection.transaction);
        for (var i = keys.length - 1; i >= 0; i--) {
            connection.loginfo(keys[i] + " - " + connection.transaction[keys[i]]);
        }
      return next(err);
    });
};



exports.hook_queue2 = function (next, connection) {

    var from = 'client-90210@manwithacalculator.com';
    var to = 'trent.millar@gmail.com'; //'bookkeeper-11000@manwithacalculator.com';
    //connection.transaction.remove_header('from');
    //connection.transaction.add_header('from', from);
    connection.transaction.remove_header('to');
    connection.transaction.add_header('to', to);

    connection.transaction.rcpt_to.pop();
    connection.transaction.rcpt_to.push(new Address(to));

    //connection.transaction.mail_from = new Address(from);

    var list = connection.transaction.header.header_list;
    for(var i = 0; i < list.length; i++){
        if(list[i].startsWith('Received:')) {
            list[i] = list[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
                'noreply@manwithacalculator.com');
        }
    }
    //connection.transaction.header.header_list = list;

    connection.loginfo("RECEIVED " + JSON.stringify(connection.transaction.received, null, 2));

    var keys = Object.getOwnPropertyNames(connection.transaction);
    for (var i = keys.length - 1; i >= 0; i--) {
        connection.loginfo(keys[i] + " - " + connection.transaction[keys[i]]);
    }

    connection.loginfo("MAIL FROM " + connection.transaction.mail_from.address());
    connection.loginfo("RCPT TO " + connection.transaction.rcpt_to);
    connection.loginfo("DETAILS " + JSON.stringify(connection.transaction.header, null, 2));

    return next();
};
