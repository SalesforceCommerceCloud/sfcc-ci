#!/usr/bin/env bash

###############################################################################
###### Testing ´sfcc-ci client:auth´
###############################################################################

# authorize client using client:auth, uses params $1 (client_id), $2 (client_secret)
echo "Testing command ´sfcc-ci client:auth´:"
node ./cli.js client:auth $1 $2
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:auth:token´
###############################################################################

echo "Testing command ´sfcc-ci client:auth:token´:"
TEST_TOKEN=`node ./cli.js client:auth:token`
if [ $? -eq 0 ] && [ ! -z "$TEST_TOKEN" ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:renew´
###############################################################################

# do an auth renewal using client:auth:renew, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci client:renew´ (expected to fail):"
node ./cli.js client:auth:renew
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# authorize client using client:auth with --renew flag, uses params $1 (client_id), $2 (client_secret)
echo "Testing command ´sfcc-ci client:auth´ with flag --renew:"
node ./cli.js client:auth $1 $2 --renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# do an auth renewal using client:auth:renew, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci client:renew´ (expected to succeed):"
node ./cli.js client:auth:renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci auth:logout´
###############################################################################

# clears any client settings, using auth:logout, uses pre-authorized client auth, no parameters
echo "Testing command ´sfcc-ci auth:logout´:"
node ./cli.js auth:logout
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:clear´
###############################################################################

# add an instance, using instance:add, uses param $3 (instance)
echo "Testing command ´sfcc-ci instance:add´ (without alias):"
node ./cli.js instance:add $3
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# clear instances, using instance:clear
echo "Testing command ´sfcc-ci instance:clear´:"
node ./cli.js instance:clear
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:add´
###############################################################################

# add an instance, using instance:add with alias option, uses param $3 (instance) and hardcoded alias "my"
echo "Testing command ´sfcc-ci instance:add´ (with alias):"
node ./cli.js instance:add $3 my
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add an invalid instance, using instance:add, uses hardcoded instance
echo "Testing command ´sfcc-ci instance:add´ with invalid instance (expected to fail):"
node ./cli.js instance:add my-instance.demandware.net
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# add another valid instance, using instance:add, uses param $3 (instance)
echo "Testing command ´sfcc-ci instance:add´:"
node ./cli.js instance:add $3 someotheralias
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:set´
###############################################################################

# set instance, using instance:set, uses param $3 (instance)
echo "Testing command ´sfcc-ci instance:set´:"
node ./cli.js instance:set $3
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# set instance, using instance:set, uses hardcoded alias "my"
echo "Testing command ´sfcc-ci instance:set´:"
node ./cli.js instance:set my
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:upload´
###############################################################################

# the next set of tests are testing real interactions with a Commerce Cloud instance
# re-authorize first using client:auth, uses params $1 (client_id), $2 (client_secret)
# this ensure, that we have a proper authentication
echo "Testing command ´sfcc-ci client:auth´ again:"
node ./cli.js client:auth $1 $2
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# site import upload, using instance:upload, uses hardcoded test file
echo "Testing command ´sfcc-ci instance:upload´:"
node ./cli.js instance:upload ./test/cli/site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# site import upload, using instance:upload, and non existing file
echo "Testing command ´sfcc-ci instance:upload´ (expected to fail):"
node ./cli.js instance:upload ./test/does/not/exist/site_import.zip
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# TODO site import upload with -i flag

###############################################################################
###### Testing ´sfcc-ci instance:state:save´
###############################################################################

# TODO

###############################################################################
###### Testing ´sfcc-ci instance:import´
###############################################################################

# site import, using instance:import, uses hardcoded test file
echo "Testing command ´sfcc-ci instance:import´ without options:"
node ./cli.js instance:import site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# TODO instance:import with -i flag

echo "Testing command ´sfcc-ci instance:import´ with --sync option:"
node ./cli.js instance:import site_import.zip --sync
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:import´ with --json option:"
node ./cli.js instance:import site_import.zip --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# TODO instance:import with -s and -j flags

###############################################################################
###### Testing ´sfcc-ci instance:state:reset´
###############################################################################

# TODO

###############################################################################
###### Testing ´sfcc-ci code:deploy´
###############################################################################

# code deploy, using code:deploy, uses hardcoded test file
echo "Testing command ´sfcc-ci code:deploy´:"
node ./cli.js code:deploy ./test/cli/custom_code.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# code deploy, using code:deploy, and non existing file
echo "Testing command ´sfcc-ci code:deploy´ (expected to fail):"
node ./cli.js code:deploy ./test/does/not/exist/custom_code.zip
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# TODO code deploy with -i flag

###############################################################################
###### Testing ´sfcc-ci code:list´
###############################################################################

# TODO

###############################################################################
###### Testing ´sfcc-ci code:activate´
###############################################################################

# code activate, using code:activate and hard coded code version
echo "Testing command ´sfcc-ci code:activate´:"
node ./cli.js code:activate modules
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# TODO code activate with -i flag

# code activate, using code:activate and non existing code version
echo "Testing command ´sfcc-ci code:activate´´ with invalid version (expected to fail):"
node ./cli.js code:activate does_not_exist
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci job:run´
###############################################################################

# TODO

###############################################################################
###### Testing ´sfcc-ci job:status´
###############################################################################

# TODO