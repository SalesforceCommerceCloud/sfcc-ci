#!/usr/bin/env bash
# Copyright (c) 2020, salesforce.com, inc.
# All rights reserved.
# SPDX-License-Identifier: BSD-3-Clause
# For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause

###############################################################################
###### Bootstrap
###############################################################################

# ensure jq is available
TEST_JQ=`hash jq`
if [ $? -eq 1 ]; then
	echo -e "jq is required to run the cli tests. Get jq from https://stedolan.github.io/jq/"
	exit 1
fi

# reset to track the time elapsed 
SECONDS=0

# pass parameters in the following order: 
# $ bin/test-cli.sh <CLIENT_ID> <CLIENT_SECRET> <USER> <USER_PW> <HOST> <SANDBOX_REALM> <TEST_ORG> <TEST_USER>

# mapping input parameters
ARG_CLIENT_ID=$1
ARG_CLIENT_SECRET=$2
ARG_USER=$3
ARG_USER_PW=$4
ARG_HOST=$5
ARG_SANDBOX_REALM=$6
ARG_TEST_ORG=$7
ARG_TEST_USER=$8

# check on host
if [ "$ARG_HOST" = "" ]; then
    echo -e "Host is unknown. Using host of created sandbox for instance tests."
else
	echo -e "Using passed host for instance tests."
fi

# check on realm
if [ "$ARG_SANDBOX_REALM" = "" ]; then
    echo -e "Realm for sandbox API unknown."
	echo 
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
node ./cli.js client:auth "$ARG_CLIENT_ID" "$ARG_CLIENT_SECRET"
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with valid client, but invalid user credentials (expected to fail):"
node ./cli.js client:auth "$ARG_CLIENT_ID" "$ARG_CLIENT_SECRET" "foo" "bar"
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with valid client and user credentials:"
node ./cli.js client:auth "$ARG_CLIENT_ID" "$ARG_CLIENT_SECRET" "$ARG_USER" "$ARG_USER_PW"
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
###### Testing ´sfcc-ci client:auth:renew´
###############################################################################

echo "Testing command ´sfcc-ci client:auth:renew´ (expected to fail):"
node ./cli.js client:auth:renew
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with --renew option:"
node ./cli.js client:auth $ARG_CLIENT_ID $ARG_CLIENT_SECRET --renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth:renew´ (expected to succeed):"
node ./cli.js client:auth:renew
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:auth´ with --renew option and resource owner grant:"
node ./cli.js client:auth $ARG_CLIENT_ID $ARG_CLIENT_SECRET $ARG_USER $ARG_USER_PW --renew
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

# Acquire new access token beforehand
echo "Acquire new access token using ´sfcc-ci client:auth <api_key>´:"
node ./cli.js client:auth "$ARG_CLIENT_ID" "$ARG_CLIENT_SECRET"
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:create´
###############################################################################

echo "Testing command ´sfcc-ci client:create´ without option (expected to fail):"
node ./cli.js client:create
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:create --configuration <configuration>´ --noprompt:"
TEST_NEW_CLIENT_RESULT=`node ./cli.js client:create --configuration '{"name": "Temp test client", "password": "%2secret(Sauce7?!"}' --noprompt --json`
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi
# grab some client details for next set of tests
TEST_NEW_CLIENT_ID=`echo $TEST_NEW_CLIENT_RESULT | jq '.client.id' -r`

###############################################################################
###### Testing ´sfcc-ci client:list´
###############################################################################

echo "Testing command ´sfcc-ci client:list´:"
node ./cli.js client:list
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:list´ --clientid <INVALID_CLIENT>´ (expected to fail):"
node ./cli.js client:list --clientid INVALID_CLIENT
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:list´ --clientid <client_id>´:"
node ./cli.js client:list --clientid $TEST_NEW_CLIENT_ID
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:update´
###############################################################################

echo "Testing command ´sfcc-ci client:update´ without option (expected to fail):"
node ./cli.js client:update
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:update --clientid <client_id> --changes <changes> --noprompt´:"
node ./cli.js client:update --clientid $TEST_NEW_CLIENT_ID --changes '{"active": false}' --noprompt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci client:rotate´
###############################################################################

echo "Testing command ´sfcc-ci client:rotate´ without option (expected to fail):"
node ./cli.js client:rotate
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:rotate --clientid <client_id> --noprompt´:"
TEST_ROTATION_RESULT=`node ./cli.js client:rotate --clientid $TEST_NEW_CLIENT_ID --noprompt --json`
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi
# grab some client details for cleanup
TEST_ROTATION_ID=`echo $TEST_ROTATION_RESULT | jq '.client.id' -r`

###############################################################################
###### Testing ´sfcc-ci client:delete´
###############################################################################

echo "Testing command ´sfcc-ci client:delete´ without option (expected to fail):"
node ./cli.js client:delete
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci client:delete --clientid <client_id> --noprompt´:"
node ./cli.js client:delete --clientid $TEST_NEW_CLIENT_ID --noprompt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# cleanup client created during rotation
node ./cli.js client:delete --clientid $TEST_ROTATION_ID --noprompt

###############################################################################
###### Testing ´sfcc-ci sandbox:realm:list´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:realm:list´:"
node ./cli.js sandbox:realm:list
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:list --json´:"
node ./cli.js sandbox:realm:list --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:list --realm´ (expected to fail):"
node ./cli.js sandbox:realm:list --realm
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:list --realm <realm>´:"
node ./cli.js sandbox:realm:list --realm $ARG_SANDBOX_REALM
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:list --realm <realm> --json´:"
node ./cli.js sandbox:realm:list --realm $ARG_SANDBOX_REALM --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:list --realm <realm> --show-usage´:"
node ./cli.js sandbox:realm:list --realm $ARG_SANDBOX_REALM --show-usage
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:realm:update´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:realm:update´ (expected to fail):"
node ./cli.js sandbox:realm:update
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:update --realm <INVALID_REALM>´ (expected to fail):"
node ./cli.js sandbox:realm:update --realm INVALID_REALM
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# memorize realm settings before tests
TEST_REALM_MAX_SANDBOX_TTL=`node ./cli.js sandbox:realm:list --realm $ARG_SANDBOX_REALM --json | jq '.configuration.sandbox.sandboxTTL.maximum' -r`
TEST_REALM_DEFAULT_SANDBOX_TTL=`node ./cli.js sandbox:realm:list --realm $ARG_SANDBOX_REALM --json | jq '.configuration.sandbox.sandboxTTL.defaultValue' -r`

echo "Testing command ´sfcc-ci sandbox:realm:update --realm <realm> --max-sandbox-ttl 144´:"
node ./cli.js sandbox:realm:update --realm $ARG_SANDBOX_REALM --max-sandbox-ttl 144
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi
echo "Testing command ´sfcc-ci sandbox:realm:update --realm <realm> --max-sandbox-ttl <previous>´ (restore):"
node ./cli.js sandbox:realm:update --realm $ARG_SANDBOX_REALM --max-sandbox-ttl $TEST_REALM_MAX_SANDBOX_TTL
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:realm:update --realm <realm> --default-sandbox-ttl 12´:"
node ./cli.js sandbox:realm:update --realm $ARG_SANDBOX_REALM --default-sandbox-ttl 12
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi
echo "Testing command ´sfcc-ci sandbox:realm:update --realm <realm> --default-sandbox-ttl <previous>´ (restore):"
node ./cli.js sandbox:realm:update --realm $ARG_SANDBOX_REALM --default-sandbox-ttl $TEST_REALM_DEFAULT_SANDBOX_TTL
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:ips´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:ips´:"
node ./cli.js sandbox:ips
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:ips --realm (expected to fail)´:"
node ./cli.js sandbox:ips --realm
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:ips --realm <realm>´:"
node ./cli.js sandbox:ips --realm $ARG_SANDBOX_REALM
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:list´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:list´:"
node ./cli.js sandbox:list
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:list --json´:"
node ./cli.js sandbox:list --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:list --sortby´ (expected to fail):"
node ./cli.js sandbox:list --sortby
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:list --sortby createdAt´:"
node ./cli.js sandbox:list --sortby createdAt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:list --sortby createdAt --json´:"
node ./cli.js sandbox:list --sortby createdAt --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:list --show-deleted´:"
node ./cli.js sandbox:list --show-deleted
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:create´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:create --realm <INVALID_REALM>´ (expected to fail):"
node ./cli.js sandbox:create --realm INVALID_REALM
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:create --realm <realm> --ttl 1 --auto-scheduled´:"
node ./cli.js sandbox:create --realm $ARG_SANDBOX_REALM --ttl 1  --auto-scheduled
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:create --realm <realm> --profile <INVALID_PROFILE>´ (expected to fail):"
node ./cli.js sandbox:create --realm $ARG_SANDBOX_REALM --profile INVALID_PROFILE
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:create --realm <realm> --profile large´ --ttl 3:"
node ./cli.js sandbox:create --realm $ARG_SANDBOX_REALM --profile large --ttl 3
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:create --realm <realm> --ttl 1 --sync´:"
node ./cli.js sandbox:create --realm $ARG_SANDBOX_REALM --ttl 1 --sync
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:create --realm <realm> --ttl 1 --sync --json´:"
TEST_NEW_SANDBOX_RESULT=`node ./cli.js sandbox:create --realm $ARG_SANDBOX_REALM --ttl 1 --sync --json`
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi
# grab some sandbox details for next set of tests
TEST_NEW_SANDBOX_ID=`echo $TEST_NEW_SANDBOX_RESULT | jq '.sandbox.id' -r`
TEST_NEW_SANDBOX_INSTANCE=`echo $TEST_NEW_SANDBOX_RESULT | jq '.sandbox.instance' -r`
TEST_NEW_SANDBOX_HOST=`node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --host`

if [ "$ARG_HOST" = "" ]; then
	ARG_HOST=$TEST_NEW_SANDBOX_HOST
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:get´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:get´ (expected to fail):"
node ./cli.js sandbox:get
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <INVALID_ID>´ (expected to fail):"
node ./cli.js sandbox:get --sandbox INVALID_ID
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox>´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --json´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox>´ (using <realm>-<instance> as id):"
node ./cli.js sandbox:get --sandbox $ARG_SANDBOX_REALM"_"$TEST_NEW_SANDBOX_INSTANCE
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --host´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --host
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --show-usage´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --show-usage
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --show-operations´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --show-operations
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --show-settings´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --show-settings
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:get --sandbox <sandbox> --show-storage´:"
node ./cli.js sandbox:get --sandbox $TEST_NEW_SANDBOX_ID --show-storage
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:update´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:update´ (expected to fail):"
node ./cli.js sandbox:update
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:update --sandbox <INVALID_ID>´ (expected to fail):"
node ./cli.js sandbox:update --sandbox INVALID_ID
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:update <sandbox> --ttl 0´:"
node ./cli.js sandbox:update --sandbox $TEST_NEW_SANDBOX_ID --ttl 0
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:update <sandbox> --ttl 2´:"
node ./cli.js sandbox:update --sandbox $TEST_NEW_SANDBOX_ID --ttl 1
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:alias:*´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:alias:list´ invalid alias (expected to fail):"
node ./cli.js sandbox:alias:list --sandbox $TEST_NEW_SANDBOX_ID -a invalidId
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:alias:add´ without sbx and alias (expected to fail):"
node ./cli.js sandbox:alias:add
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:alias:add´ without alias (expected to fail):"
node ./cli.js sandbox:alias:add --sandbox $TEST_NEW_SANDBOX_ID
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:alias:add´:"
ALIAS_RESULT=`node ./cli.js sandbox:alias:add --sandbox $TEST_NEW_SANDBOX_ID -h my.newalias.com --json`
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

TEST_NEW_ALIAS_ID=`echo $ALIAS_RESULT | jq '.id' -r`
echo "Testing command ´sfcc-ci sandbox:alias:list´ with sbx and alias:"
node ./cli.js sandbox:alias:list --sandbox $TEST_NEW_SANDBOX_ID -a $TEST_NEW_ALIAS_ID --json
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:alias:list´ without sbx (expected to fail)):"
node ./cli.js sandbox:alias:list
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi


echo "Testing command ´sfcc-ci sandbox:alias:list:´ with sbx"
node ./cli.js sandbox:alias:list --sandbox $TEST_NEW_SANDBOX_ID
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:alias:delete´ (invalid alias):"
node ./cli.js sandbox:alias:delete --sandbox $TEST_NEW_SANDBOX_ID -a $TEST_NEW_ALIAS_ID --noprompt
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
node ./cli.js instance:add $ARG_HOST
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
node ./cli.js instance:add $ARG_HOST my
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
node ./cli.js instance:add $ARG_HOST someotheralias
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
node ./cli.js instance:set $ARG_HOST
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

echo "Testing command ´sfcc-ci instance:upload´:"
node ./cli.js instance:upload ./test/cli/site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:upload´ with --instance option:"
node ./cli.js instance:upload ./test/cli/site_import.zip --instance $ARG_HOST
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
###### Testing ´sfcc-ci instance:import´
###############################################################################

echo "Testing command ´sfcc-ci instance:import´ with --sync option:"
node ./cli.js instance:import site_import.zip --sync
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

echo "Testing command ´sfcc-ci instance:import´ with --instance option:"
node ./cli.js instance:import site_import.zip --instance $ARG_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci code:deploy´
###############################################################################

echo "Testing command ´sfcc-ci code:deploy´ without option:"
node ./cli.js code:deploy ./test/cli/code_version.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:deploy´ with non-existing file (expected to fail):"
node ./cli.js code:deploy ./test/does/not/exist/code_version.zip
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:deploy´ with --instance option:"
node ./cli.js code:deploy ./test/cli/code_version.zip --instance $ARG_HOST
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:deploy´ with --instance and --activate option:"
node ./cli.js code:deploy ./test/cli/code_version.zip --instance $ARG_HOST --activate
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
node ./cli.js code:activate version1
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:activate´ with --instance option:"
node ./cli.js code:activate code_version --instance $ARG_HOST
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
###### Testing ´sfcc-ci code:delete´
###############################################################################

echo "Testing command ´sfcc-ci code:delete´ with invalid code version (expected to fail):"
node ./cli.js code:delete --code does_not_exists --instance $ARG_HOST --noprompt
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci code:delete´:"
node ./cli.js code:delete --code version1 --instance $ARG_HOST --noprompt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci data:upload´
###############################################################################

echo "Testing command ´sfcc-ci data:upload´:"
node ./cli.js data:upload --instance $ARG_HOST --target impex/src/upload --file ./test/cli/site_import.zip
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci instance:export´
###############################################################################

echo "Testing command ´sfcc-ci instance:export´ with --sync flag:"
node ./cli.js instance:export --instance $ARG_HOST --data '{"global_data":{"meta_data":true}}' --file test_export_sync.zip --sync
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:export´ with --sync and --failfast flag (expected to fail):"
node ./cli.js instance:export --instance $ARG_HOST --data '{"global_data":{"meta_data":true},"does_not_exis":true}' --file test_export_sync.zip --sync --failfast
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci instance:export´ without --sync flag:"
node ./cli.js instance:export --instance $ARG_HOST --data '{"global_data":{"meta_data":true}}' --file test_export_async.zip
if [ $? -eq 0 ]; then
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

###############################################################################
###### Testing ´sfcc-ci cartridge:add´
###############################################################################

echo "Testing command ´sfcc-ci cartridge:add without --siteid (expected to fail)"
node ./cli.js cartridge:add my_plugin -p first
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci cartridge:add"
node ./cli.js cartridge:add my_plugin -p first --siteid MySite
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:start´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:start´ (expected to fail):"
node ./cli.js sandbox:start
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:start --sandbox <INVALID_ID>´ (expected to fail):"
node ./cli.js sandbox:start --sandbox INVALID_ID
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:start --sandbox <sandbox>´:"
node ./cli.js sandbox:start --sandbox $TEST_NEW_SANDBOX_ID
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:start --sandbox <sandbox>´ (using <realm>-<instance> as id):"
node ./cli.js sandbox:start --sandbox $ARG_SANDBOX_REALM"_"$TEST_NEW_SANDBOX_INSTANCE
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:start --sandbox <sandbox> --sync´:"
node ./cli.js sandbox:start --sandbox $TEST_NEW_SANDBOX_ID --sync
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:stop´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:stop (expected to fail):"
node ./cli.js sandbox:stop
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:stop --sandbox <INVALID_ID>´ (expected to fail):"
node ./cli.js sandbox:stop --sandbox INVALID_ID
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:stop --sandbox <sandbox>´:"
node ./cli.js sandbox:stop --sandbox $TEST_NEW_SANDBOX_ID
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:stop --sandbox <sandbox>´ (using <realm>-<instance> as id):"
node ./cli.js sandbox:stop --sandbox $ARG_SANDBOX_REALM"_"$TEST_NEW_SANDBOX_INSTANCE
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:stop --sandbox <sandbox> --sync´:"
node ./cli.js sandbox:stop --sandbox $TEST_NEW_SANDBOX_ID --sync
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci sandbox:delete´
###############################################################################

echo "Testing command ´sfcc-ci sandbox:delete´ (expected to fail):"
node ./cli.js sandbox:delete
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:delete --sandbox <INVALID_ID> --noprompt´ (expected to fail):"
node ./cli.js sandbox:delete --sandbox INVALID_ID --noprompt
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci sandbox:delete --sandbox <sandbox> --noprompt´:"
node ./cli.js sandbox:delete --sandbox $TEST_NEW_SANDBOX_ID --noprompt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci org:list´
###############################################################################

echo "Testing command ´sfcc-ci org:list´ without option:"
node ./cli.js org:list
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci org:list´ with option -c:"
node ./cli.js org:list -c 2
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci org:list´ with option --all:"
node ./cli.js org:list --all
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci org:list --org <org>´ with invalid org (expected to fail):"
node ./cli.js org:list --org does_not_exist
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci org:list --org <org>´:"
node ./cli.js org:list --org "$ARG_TEST_ORG"
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci user:create´
###############################################################################

echo "Testing command ´sfcc-ci user:create´ without option (expected to fail):"
node ./cli.js user:create
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci user:create --login <login>´:"
node ./cli.js user:create --org "$ARG_TEST_ORG" --login "$ARG_TEST_USER" --user '{"firstName": "John", "lastName": "Doe"}'
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci user:list´
###############################################################################

echo "Testing command ´sfcc-ci user:list´ without option:"
node ./cli.js user:list
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci user:list --login <login>´ with invalid user (expected to fail):"
node ./cli.js user:list --login does_not_exist
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci user:list --login <login>´:"
node ./cli.js user:list --login "$ARG_TEST_USER"
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

###############################################################################
###### Testing ´sfcc-ci user:delete´
###############################################################################

echo "Testing command ´sfcc-ci user:delete without option (expected to fail):"
node ./cli.js user:delete
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci user:delete --login <login>´ --noprompt with invalid user (expected to fail):"
node ./cli.js user:delete --login does_not_exist --noprompt
if [ $? -eq 1 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

echo "Testing command ´sfcc-ci user:delete --login <login> --purge --noprompt:"
node ./cli.js user:delete --login "$ARG_TEST_USER" --purge --noprompt
if [ $? -eq 0 ]; then
    echo -e "\t> OK"
else
	echo -e "\t> FAILED"
	exit 1
fi

# log time elapsed
duration=$SECONDS
echo -e "SUCCESS! Tests finished after $(($duration / 60)) minutes and $(($duration % 60)) seconds."