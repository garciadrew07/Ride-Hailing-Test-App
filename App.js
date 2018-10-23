import React, { Component } from 'react';
import { StyleSheet, Text, View, Alert } from 'react-native';
import Pusher from 'pusher-js/react-native';
import MapView from 'react-native-maps';

import Geocoder from 'react-native-geocoding';
Geocoder.setApiKey('AIzaSyDin7CwrUdJJU9vdUi54wGlV_xW9DOq93M');
import { regionFrom, getLatLonDiffInMeters } from './helpers';
// import  from './styles.js';

export default class grabDriver extends Component {

    state = {
        passenger: null, // for storing the passenger info
        region: null, // for storing the current location of the driver
        accuracy: null, // for storing the accuracy of the location
        nearby_alert: false, // whether the nearby alert has already been issued
        has_passenger: false, // whether the driver has a passenger (once they agree to a request, this becomes true)
        has_ridden: false // whether the passenger has already ridden the vehicle
    }

    constructor() {
        super();

        this.available_drivers_channel = null; // this is where passengers will send a request to any available driver
        this.ride_channel = null; // the channel used for communicating the current location
        // for a specific ride. Channel name is the username of the passenger

        this.pusher = null; // the pusher client
    }

    componentWillMount() {
        this.pusher = new Pusher('072da157e0cbace667aa', {
            authEndpoint: '/pusher/auth',
            cluster: 'mt1',
            encrypted: true
        });
        this.available_drivers_channel = this.pusher.subscribe('private-available-drivers'); // subscribe to "available-drivers" channel
        // listen to the "driver-request" event
        this.available_drivers_channel.bind('client-driver-request', (passenger_data) => {

            if(!this.state.has_passenger){ // if the driver has currently no passenger
                // alert the driver that they have a request
                Alert.alert(
                    "You got a passenger!", // alert title
                    "Pickup: " + passenger_data.pickup.name + "\nDrop off: " + passenger_data.dropoff.name, // alert body
                    [
                        {
                            text: "Later bro", // text for rejecting the request
                            onPress: () => {
                                console.log('Cancel Pressed');
                            },
                            style: 'cancel'
                        },
                        {
                            text: 'Gotcha!', // text for accepting the request
                            onPress: () => {
                                // next: add code for when driver accepts the request
                            }
                        },
                    ],
                    { cancelable: false } // no cancel button
                );

            }

        });
        this.ride_channel = this.pusher.subscribe('private-ride-' + passenger_data.username);

        this.ride_channel.bind('pusher:subscription_succeeded', () => {
            // send a handshake event to the passenger
            this.ride_channel.trigger('client-driver-response', {
                response: 'yes' // yes, I'm available
            });

            // listen for the acknowledgement from the passenger
            this.ride_channel.bind('client-driver-response', (driver_response) => {

                if(driver_response.response == 'yes'){ // passenger says yes

                    //passenger has no ride yet
                    this.setState({
                        has_passenger: true,
                        passenger: {
                            username: passenger_data.username,
                            pickup: passenger_data.pickup,
                            dropoff: passenger_data.dropoff
                        }
                    });

                    // next: reverse-geocode the driver location to the actual name of the place

                }else{
                    // alert that passenger already has a ride
                    Alert.alert(
                        "Too late bro!",
                        "Another driver beat you to it.",
                        [
                            {
                                text: 'Ok'
                            },
                        ],
                        { cancelable: false }
                    );
                }

            });

        });
        Geocoder.getFromLatLng(this.state.region.latitude, this.state.region.longitude).then(
            (json) => {
                var address_component = json.results[0].address_components[0];

                // inform passenger that it has found a driver
                this.ride_channel.trigger('client-found-driver', {
                    driver: {
                        name: 'John Smith'
                    },
                    location: {
                        name: address_component.long_name,
                        latitude: this.state.region.latitude,
                        longitude: this.state.region.longitude,
                        accuracy: this.state.accuracy
                    }
                });

            },
            (error) => {
                console.log('err geocoding: ', error);
            }
        );
    }

    componentDidMount() {
        this.watchId = navigator.geolocation.watchPosition(
            (position) => {

                var region = regionFrom(
                    position.coords.latitude,
                    position.coords.longitude,
                    position.coords.accuracy
                );
                // update the UI
                this.setState({
                    region: region,
                    accuracy: position.coords.accuracy
                });

                if(this.state.has_passenger && this.state.passenger){
                    // next: add code for sending driver's current location to passenger
                }
            },
            (error) => this.setState({ error: error.message }),
            {
                enableHighAccuracy: true, // allows you to get the most accurate location
                timeout: 20000, // (milliseconds) in which the app has to wait for location before it throws an error
                maximumAge: 1000, // (milliseconds) if a previous location exists in the cache, how old for it to be considered acceptable
                distanceFilter: 10 // (meters) how many meters the user has to move before a location update is triggered
            },
        );
        this.ride_channel.trigger('client-driver-location', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
        });
        var diff_in_meter_pickup = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude,
            this.state.passenger.pickup.latitude, this.state.passenger.pickup.longitude);

        if(diff_in_meter_pickup <= 20){

            if(!this.state.has_ridden){
                // inform the passenger that the driver is very near
                this.ride_channel.trigger('client-driver-message', {
                    type: 'near_pickup',
                    title: 'Just a heads up',
                    msg: 'Your driver is near, let your presence be known!'
                });

                /*
                we're going to go ahead and assume that the passenger has rode
                the vehicle at this point
                */
                this.setState({
                    has_ridden: true
                });
            }

        }else if(diff_in_meter_pickup <= 50){

            if(!this.state.nearby_alert){
                this.setState({
                    nearby_alert: true
                });
                /*
                since the location updates every 10 meters, this alert will be triggered
                at least five times unless we do this
                */
                Alert.alert(
                    "Slow down",
                    "Your passenger is just around the corner",
                    [
                        {
                            text: 'Gotcha!'
                        },
                    ],
                    { cancelable: false }
                );

            }

        }

        var diff_in_meter_dropoff = getLatLonDiffInMeters(
            position.coords.latitude, position.coords.longitude,
            this.state.passenger.dropoff.latitude, this.state.passenger.dropoff.longitude);

        if(diff_in_meter_dropoff <= 20){
            this.ride_channel.trigger('client-driver-message', {
                type: 'near_dropoff',
                title: "Brace yourself",
                msg: "You're very close to your destination. Please prepare your payment."
            });

            // unbind from passenger event
            this.ride_channel.unbind('client-driver-response');
            // unsubscribe from passenger channel
            this.pusher.unsubscribe('private-ride-' + this.state.passenger.username);

            this.setState({
                passenger: null,
                has_passenger: false,
                has_ridden: false
            });

        }


    }

    componentWillUnmount() {
        navigator.geolocation.clearWatch(this.watchId);
    }

    render() {
        return (
            <View style={styles.container}>
                {
                    this.state.region &&
                    <MapView
                        style={styles.map}
                        region={this.state.region}
                    >
                        <MapView.Marker
                            coordinate={{
                                latitude: this.state.region.latitude,
                                longitude: this.state.region.longitude}}
                            title={"You're here"}
                        />
                        {
                            this.state.passenger && !this.state.has_ridden &&
                            <MapView.Marker
                                coordinate={{
                                    latitude: this.state.passenger.pickup.latitude,
                                    longitude: this.state.passenger.pickup.longitude}}
                                title={"Your passenger is here"}
                                pinColor={"#4CDB00"}
                            />
                        }
                    </MapView>
                }
            </View>
        );
    }

}


const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
});