// srs

// documentation via: haraka -c /Users/tmillar/dev/repo/haraka-test -h plugins/srs

// Put your plugin code here
// type: `haraka -h Plugins` for documentation on how to create a plugin
'use strict';

const Address = require('address-rfc2821').Address;

exports.register = function () {
    const plugin = this;
    plugin.load_errs = [];

    plugin.load_srs_ini();

    if (plugin.load_errs.length > 0) return;

    //plugin.register_hook('queue', 'queue_forward');

};

exports.load_srs_ini = function () {
    const plugin = this;

    plugin.cfg = plugin.config.get('srs.ini', {
            booleans: [
                '-main.mongoUrl',
            ],
        },
        function () {
            plugin.load_srs_ini();
        });
};

exports.hook_queue = function (next, connection) {
    
    var from = 'client-90210@manwithacalculator.com';
    var to = 'trent.millar@gmail.com'; //'bookkeeper-11000@manwithacalculator.com';
    connection.transaction.remove_header('from');
    connection.transaction.add_header('from', from);
    connection.transaction.remove_header('to');
    connection.transaction.add_header('to', to);

    connection.transaction.rcpt_to.pop();
    connection.transaction.rcpt_to.push(new Address(to));

    connection.transaction.mail_from = new Address(from);

    //connection.transaction.mail_from.push('client-90210@manwithacalculator.com');


    /*var received = connection.transaction.header.headers_decoded.received;
     for(var i = 0; i < received.length; i++){
     received[i] = received[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
     'noreply@domain.com');
     }
     connection.transaction.header.headers.received = received;
     */

    var list = connection.transaction.header.header_list;
    for(var i = 0; i < list.length; i++){
        if(list[i].startsWith('Received:')) {
            list[i] = list[i].replace(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/,
                'noreply@manwithacalculator.com');
        }
    }
    connection.transaction.header.header_list = list;

    connection.loginfo("RECEIVED " + JSON.stringify(connection.transaction.received, null, 2));

    var keys = Object.getOwnPropertyNames(connection.transaction);
    for (var i = keys.length - 1; i >= 0; i--) {
        connection.loginfo(keys[i] + " - " + connection.transaction[keys[i]]);
    }

    connection.loginfo("MAIL FROM " + connection.transaction.mail_from.address());
    connection.loginfo("RCPT TO " + connection.transaction.rcpt_to);
    connection.loginfo("DETAILS " + JSON.stringify(connection.transaction.header, null, 2));

/*
    connection.transaction.message_stream.pipe(ws);
*/
    return next();
};
