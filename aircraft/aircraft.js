const axios = require('axios');
const geolib = require('geolib');
const AircraftDb = require('./dbloader');

async function getAircraft(node, config) {

    let baseUrl = config.server.replace(/\/+$/, '');

    // fetch  data
    var response = await axios.all([
        axios.get(`${baseUrl}/data/aircraft.json`),
        axios.get(`${baseUrl}/data/receiver.json`)
    ]);
    var aircraft = response[0].data.aircraft;
    var receiver = response[1].data;
    
    const fromCoords = { latitude: receiver.lat, longitude: receiver.lon };

    let matches = [];

    aircraft.forEach(a => {
        if (!a.lat || !a.lon) return;

        // check within radius
        let distance = geolib.getDistance(fromCoords, { latitude: a.lat, longitude: a.lon });
        let distanceMatch = distance < config.radius;

        // check less than max altitude
        let maxAltitude = config.maxAltitude;
        // filter out 'ground'
        let altitude = typeof a.alt_baro == 'number' ? a.alt_baro : maxAltitude + 1;
        let altitudeMatch = altitude <= maxAltitude;

        if (distanceMatch && altitudeMatch) {
            matches.push({
                ...a,
                distance
            });
        }

    });

    // sort matches
    matches.sort((a, b) => a.distance - b.distance);

    // select the first one
    let match =  matches[0];

    // calculate bearing
    if (match) {
        match.bearing = geolib.getCompassDirection(fromCoords, { latitude: match.lat, longitude: match.lon })
    }

    // get aircraft type
    if (match) {
        try {
            let aircraftData = await node.aircraftDb.getAircraftData(match.hex);
            match.type = aircraftData.t;
        }
        catch (error) { node.error(error); }
    }

    return match
}

module.exports = (RED) => {
    function Aircraft(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        node.aircraftDb = new AircraftDb(config.server);
        node.on('input', async function (msg, send, done) {
            try {
                msg.payload = await getAircraft(node, config);
                node.send(msg);
            }
            catch (error) {
                done(error);
            }
        });
    }
    RED.nodes.registerType("aircraft", Aircraft);
}