#!/usr/bin/env bash

###############################################################################
###### Bootstrap
###############################################################################

# ensure jq is available
TEST_JQ=`hash jq`
if [ $? -eq 1 ]; then
	echo -e "jq is required to run the cli tests. Get jq from https://stedolan.github.io/jq/"
	exit 1
fi

# mapping input parameters
TEST_SCOPE=$1
TEST_CLIENT_ID=$2
TEST_CLIENT_SECRET=$3
TEST_HOST=$4
TEST_USER=$5
TEST_USER_PW=$6

# scope of tests, either 'minimal' or 'full'
if [ $TEST_SCOPE = "minimal" ]; then
	echo -e "Running default test scope with limited coverage of commands and options..."
elif [ $TEST_SCOPE = "full" ]; then
	echo -e "Running full test scope with maximum coverage of commands and options..."
else
	echo -e "Unknown test scope $TEST_SCOPE. Please provide either 'minimal' or 'full'."
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci´
###############################################################################

echo "Testing command ´sfcc-ci´ without command and option:"
node ./cli.js
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci´ without command and --help option:"
node ./cli.js --help
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci´ without command and --version option:"
node ./cli.js --version
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci´ and unknown command (expected to fail):"
node ./cli.js unknown
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:auth´
###############################################################################

echo "Testing command ´sfcc-ci client:auth´ without option:"
node ./cli.js client:auth "$TEST_CLIENT_ID" "$TEST_CLIENT_SECRET"
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with valid client, but invalid user credentials (expected to fail):"
node ./cli.js client:auth "$TEST_CLIENT_ID" "$TEST_CLIENT_SECRET" "foo" "bar"
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with valid client and user credentials:"
node ./cli.js client:auth "$TEST_CLIENT_ID" "$TEST_CLIENT_SECRET" "$TEST_USER" "$TEST_USER_PW"
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
TEST_RESULT=`node ./cli.js client:auth:token`
if [ $? -eq 0 ] && [ ! -z "$TEST_RESULT" ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:renew´
###############################################################################

echo "Testing command ´sfcc-ci client:renew´ (expected to fail):"
node ./cli.js client:auth:renew
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with --renew option:"
node ./cli.js client:auth $TEST_CLIENT_ID $TEST_CLIENT_SECRET --renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

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

echo "Testing command ´sfcc-ci instance:add´ (without alias):"
node ./cli.js instance:add $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

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

echo "Testing command ´sfcc-ci instance:add´ (with alias):"
node ./cli.js instance:add $TEST_HOST my
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:add´ with invalid instance (expected to fail):"
node ./cli.js instance:add my-instance.demandware.net
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:add´:"
node ./cli.js instance:add $TEST_HOST someotheralias
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:set´
###############################################################################

echo "Testing command ´sfcc-ci instance:set´ with host name:"
node ./cli.js instance:set $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:set´ with alias:"
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
# re-authorize first using client:auth, this ensure, that we have a proper authentication
echo "Testing command ´sfcc-ci client:auth´ again:"
node ./cli.js client:auth $TEST_CLIENT_ID $TEST_CLIENT_SECRET
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:upload´:"
node ./cli.js instance:upload ./test/cli/site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:upload´ with --instance option:"
node ./cli.js instance:upload ./test/cli/site_import.zip --instance $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:upload´ with non-existing file (expected to fail):"
node ./cli.js instance:upload ./test/does/not/exist/site_import.zip
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:state:save´
###############################################################################

if [ $TEST_SCOPE = "full" ]; then
	echo "Testing command ´sfcc-ci instance:state:save´ with --sync option:"
	node ./cli.js instance:state:save --sync
	if [ $? -eq 0 ]; then
		echo -e "\t> OK"
	else
		echo -e "\t> FAILED"
		exit 1
	fi
fi

###############################################################################
###### Testing ´sfcc-ci instance:import´
###############################################################################

echo "Testing command ´sfcc-ci instance:import´ without options:"
node ./cli.js instance:import site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:import´ with --instance option:"
node ./cli.js instance:import site_import.zip --instance $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

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

echo "Testing command ´sfcc-ci instance:import´ with --json and --sync option:"
TEST_RESULT=`node ./cli.js instance:import site_import.zip --json --sync | jq '.exit_status.code' -r`
if [ $? -eq 0 ] && [ $TEST_RESULT = "OK" ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	echo -e "\t> Test result was: $TEST_RESULT"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:state:reset´
###############################################################################

if [ $TEST_SCOPE = "full" ]; then
	echo "Testing command ´sfcc-ci instance:state:reset´ with --sync option:"
	node ./cli.js instance:state:reset --sync
	if [ $? -eq 0 ]; then
		echo -e "\t> OK"
	else
		echo -e "\t> FAILED"
		exit 1
	fi
fi

###############################################################################
###### Testing ´sfcc-ci code:deploy´
###############################################################################

echo "Testing command ´sfcc-ci code:deploy´ without option:"
node ./cli.js code:deploy ./test/cli/custom_code.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:deploy´ with non-existing file (expected to fail):"
node ./cli.js code:deploy ./test/does/not/exist/custom_code.zip
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:deploy´ with --instance option:"
node ./cli.js code:deploy ./test/cli/custom_code.zip --instance $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci code:list´
###############################################################################

echo "Testing command ´sfcc-ci code:list´ with --json option:"
TEST_RESULT=`node ./cli.js code:list --json | jq '.count'`
if [ $? -eq 0 ] && [ $TEST_RESULT -gt 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	echo -e "\t> Test result was: $TEST_RESULT"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci code:activate´
###############################################################################

echo "Testing command ´sfcc-ci code:activate´ without option:"
node ./cli.js code:activate modules
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:activate´ with --instance option:"
node ./cli.js code:activate modules --instance $TEST_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:activate´ with invalid version (expected to fail):"
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