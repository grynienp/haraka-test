# haraka-test

1. `./node_modules/Haraka/bin/haraka -i ./haraka`
2. `vi ./haraka/config/smtp.ini`
3. uncomment `listen=[::0]:25` and change `25` to `2525`
4. `vi ./haraka/config/plugins`
5. comment `queue/smtp_forward` and add `test_queue`
6. `vi ./haraka/config/host_list` and remove all but add `haraka.test`
7. run `./node_modules/Haraka/bin/haraka -c ./haraka/`
8. `brew install swaks`
9. send test email `swaks -h domain.com -f test@gmail.com -t help@haraka.test -s localhost -p 2525`
