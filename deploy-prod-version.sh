#!/bin/bash
# $Id: deploy-prod-version.sh,v 1.7 2008-11-23 05:46:57 cvsuser Exp $

. deploy-common.sh

export APP_VERSION_RELTYPE="prod-zindus"

echo -n "have you edited build-config.sh to set APP_VERSION_NUMBER ? "
read is_version_updated
if [ "$is_version_updated" == "y" ]; then

	./build.sh

	echo -n "have you signed update.rdf with mccoy ? "
	# read is_signed
	is_signed="y"
	if [ "$is_signed" == "y" ]; then

		APPVERSION=`get_appversion`
		PLATFORM_ID=`get_platform_id`

		generate_and_copy_rdfs $APPVERSION $PLATFORM_ID 'prod'

		RELEASE_TAG=`echo $APPVERSION | sed 's/\./_/g'`
		RELEASE_TAG="release-"$RELEASE_TAG
		echo release tag is $RELEASE_TAG

		cvs commit -m ""
		cvs tag $RELEASE_TAG
	else
		echo aborted.
	fi
else
	echo aborted.
fi

exit
