// -*- mode: javascript; indent-tabs-mode: nil; c-basic-offset: 8 -*-

// Part of dump1090, a Mode S message decoder for RTLSDR devices.
//
// dbloader.js: load aircraft metadata from static json files
//
// Copyright (c) 2014,2015 Oliver Jowett <oliver@mutability.co.uk>
//
// Modifications Copyright (c) 2020 Justin Walker
// 2020-05-29 refactored to use axios and removed jQuery requirement, export as node.js module
//
// This file is free software: you may copy, redistribute and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 2 of the License, or (at your
// option) any later version.
//
// This file is distributed in the hope that it will be useful, but
// WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
// General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.
'use strict';

const axios = require('axios');

const AircraftDb = (function() {

    function Deferred() {
        const p = this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.then = p.then.bind(p);
        this.catch = p.catch.bind(p);
        if (p.finally) {
            this.finally = p.finally.bind(p);
        }
    }

    function AircraftDb(baseUrl) {
        // sanitize baseUrl
        var baseUrl = baseUrl.replace(/\/+$/, '');

        var _aircraft_cache = {};
        var _aircraft_type_cache = null;

        ///
        /// public methods
        /// 

        this.getAircraftData = function (icao) {
            var defer;

            icao = icao.toUpperCase();

            if (icao in _aircraft_cache) {
                defer = _aircraft_cache[icao];
            } else {
                // load from blocks:
                defer = _aircraft_cache[icao] = new Deferred();
                request_from_db(icao, 1, defer);
            }

            return defer;
        }

        ///
        /// internal
        ///

        function request_from_db(icao, level, defer) {
            var bkey = icao.substring(0, level);
            var dkey = icao.substring(level);
            var req = db_ajax(bkey);

            req.then(function (response) {
                var data = response.data;
                var subkey;

                if (dkey in data) {
                    getIcaoAircraftTypeData(data[dkey], defer);
                    return;
                }

                if ("children" in data) {
                    subkey = bkey + dkey.substring(0, 1);
                    if (data.children.indexOf(subkey) != -1) {
                        request_from_db(icao, level + 1, defer);
                        return;
                    }
                }
                defer.reject();
            });

            req.catch(function (jqXHR, textStatus, errorThrown) {
                defer.reject();
            });
        }

        function getIcaoAircraftTypeData(aircraftData, defer) {
            if (_aircraft_type_cache === null) {
                console.log("axios.get()", `${baseUrl}/db/aircraft_types/icao_aircraft_types.json`);
                axios.get(`${baseUrl}/db/aircraft_types/icao_aircraft_types.json`)
                    .then(function (typeLookupData) {
                        _aircraft_type_cache = typeLookupData;
                    })
                    .finally(function () {
                        lookupIcaoAircraftType(aircraftData, defer);
                    });
            }
            else {
                lookupIcaoAircraftType(aircraftData, defer);
            }
        }

        function lookupIcaoAircraftType(aircraftData, defer) {
            if (_aircraft_type_cache !== null && "t" in aircraftData) {
                var typeDesignator = aircraftData.t.toUpperCase();
                if (typeDesignator in _aircraft_type_cache) {
                    var typeData = _aircraft_type_cache[typeDesignator];
                    if (typeData.desc != undefined && aircraftData.desc === undefined && typeData.desc != null && typeData.desc.length == 3) {
                        aircraftData.desc = typeData.desc;
                    }
                    if (typeData.wtc != undefined && aircraftData.wtc === undefined) {
                        aircraftData.wtc = typeData.wtc;
                    }
                }
            }

            defer.resolve(aircraftData);
        }

        var _request_count = 0;
        var _request_queue = [];
        var _request_cache = {};

        var MAX_REQUESTS = 2;

        function db_ajax(bkey) {
            var defer;

            if (bkey in _request_cache) {
                return _request_cache[bkey];
            }

            if (_request_count < MAX_REQUESTS) {
                // just do ajax directly
                ++_request_count;
                console.log('axios.get()', `${baseUrl}/db/${bkey}.json`);
                defer = _request_cache[bkey] = axios.get(`${baseUrl}/db/${bkey}.json`);
                defer.finally(db_ajax_request_complete);
            } else {
                // put it in the queue
                defer = _request_cache[bkey] = new Deferred();
                defer.bkey = bkey;
                _request_queue.push(defer);
            }

            return defer;
        }

        function db_ajax_request_complete() {
            var req;

            if (_request_queue.length == 0) {
                --_request_count;
            } else {
                req = _request_queue.shift();
                console.log('axios.get()', `${baseUrl}/db/${req.bkey}.json`);
                ajaxreq = axios.get(`${baseUrl}/db/${req.bkey}.json`)
                    .then((response) => { req.resolve(response.data); })
                    .catch((jqxhr, status, error) => { req.reject(jqxhr, status, error); })
                    .finally(db_ajax_request_complete);
            }
        }
    }

    return AircraftDb
}());

module.exports = AircraftDb;
