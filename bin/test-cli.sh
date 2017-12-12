#!/usr/bin/env bash

# authorize client using client:auth, uses params $1 (client_id), $2 (client_secret)
echo "Testing command ´sfcc-ci client:auth´:"
/usr/local/bin/sfcc-ci client:auth $1 $2
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# do an auth renewal using client:auth:renew, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci client:renew´ (expected to fail):"
/usr/local/bin/sfcc-ci client:auth:renew
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# authorize client using client:auth with --renew flag, uses params $1 (client_id), $2 (client_secret)
echo "Testing command ´sfcc-ci client:auth´ with flag --renew:"
/usr/local/bin/sfcc-ci client:auth $1 $2 --renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# do an auth renewal using client:auth:renew, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci client:renew´ (expected to succeed):"
/usr/local/bin/sfcc-ci client:auth:renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# clears any client settings, using client:clear, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci client:clear´:"
/usr/local/bin/sfcc-ci client:clear
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add an instance, using instance:add, uses param $3 (instance)
echo "Testing command ´sfcc-ci instance:add´ (without alias):"
/usr/local/bin/sfcc-ci instance:add $3
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# clear instances, using instance:clear
echo "Testing command ´sfcc-ci instance:clear´:"
/usr/local/bin/sfcc-ci instance:clear
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add an instance, using instance:add with alias option, uses param $3 (instance) and hardcoded alias "my"
echo "Testing command ´sfcc-ci instance:add´ (with alias):"
/usr/local/bin/sfcc-ci instance:add $3 my
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add an invalid instance, using instance:add, uses hardcoded instance
echo "Testing command ´sfcc-ci instance:add´ with invalid instance (expected to fail):"
/usr/local/bin/sfcc-ci instance:add my-instance.demandware.net
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add another valid instance, using instance:add, uses param $3 (instance)
echo "Testing command ´sfcc-ci instance:add´:"
/usr/local/bin/sfcc-ci instance:add $3 someotheralias
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# set instance, using instance:set, uses hardcoded alias "my"
echo "Testing command ´sfcc-ci instance:set´:"
/usr/local/bin/sfcc-ci instance:set my
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi