import http from 'k6/http';
import {check, group, sleep} from "k6";
import {Counter, Rate, Trend} from "k6/metrics";
import encoding from 'k6/encoding';
import {randomIntBetween, randomItem, uuidv4} from "https://jslib.k6.io/k6-utils/1.0.0/index.js";
import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';
import {SharedArray} from 'k6/data';

const loginData = JSON.parse(open("../data/users.json"));

const uuidData = new SharedArray('some name', function () {
    return papaparse.parse(open('../data/v4_uuids.csv'), {header: false}).data;
});

export const options = {
    stages: [
        {target: 500, duration: "20s"},
        {target: 500, duration: "30s"},
        {target: 0, duration: "10s"}
    ],
    thresholds: {
        "http_req_duration": ["p(95)<500"],
        "check_failure_rate": ["rate<0.3"]
    },
    tlsAuth: [
        {
            domains: ['localhost:8000'],
            cert: open('../ssl/client1-crt.pem'),
            key: open('../ssl/client1-key.pem'),
        },
    ],
    ext: {
        loadimpact: {
            projectID: 3631083,
            name: `${__ENV.TEST_NAME}`
        }
    }
};

// Custom metrics
let successfulLogins = new Counter("successful_logins");
let checkFailureRate = new Rate("check_failure_rate");
let timeToFirstByte = new Trend("time_to_first_byte", true);

export default function () {
    group("Authentication", function () {
        let res = null;
        let position = Math.floor(Math.random() * loginData.users.length);
        let credentials = loginData.users[position];
        let username = credentials.username;
        let password = credentials.password;

        res = http.get("http://localhost:8000/auth", {tags: {name: "GET auth_transaction"}});
        let checkRes = check(res, {
            'status equals 401': (r) => r.status === 401,
            'body contains Authorization Required': (r) => r.body.indexOf("Authorization Required") !== -1
        });

        const encodedCredentials = encoding.b64encode(username + ":" + password);
        const options = {
            headers: {
                Authorization: `Basic ${encodedCredentials}`,
            },
            tags: {name: "GET auth_transaction"}
        };

        res = http.get("http://localhost:8000/auth", options);
        check(res, {
            'status equals 200': (r) => r.status === 200,
            'body contains { chamber }': (r) => r.body.indexOf("{ chamber }") !== -1
        });

        // Record successful logins
        if (checkRes) {
            successfulLogins.add(1);
        }

        // Record check failures
        checkFailureRate.add(!checkRes, {page: "auth"});
    });

    sleep(randomIntBetween(1, 5));

    group("Sample Transactions", function () {
        let res = http.get("http://localhost:8000/echo?x_api_session=" + uuidv4() + "&x_item=" + randomItem([1, 2, 3, 4]), {tags: {name: "GET sample_transaction"}});
        const vars = {};
        vars["x_api_session"] = res.json().params.get[0].value;
        vars["x_item"] = res.json().params.get[1].value;

        // console.log(`${vars["x_api_session"]}`);

        const payload = JSON.stringify({
            x_item: `${vars["x_item"]}`,
        });

        res = http.post("http://localhost:8000/echo", payload, {
            headers: {'X-API-Session': `${vars["x_api_session"]}`},
            tags: {name: "POST sample_transaction"}
        });

        let checkRes = check(res, {
            "headers contains x_api_session": (r) => r.headers['x_api_session'] !== 'undefined'
        });

        checkFailureRate.add(!checkRes);
    });

    sleep(randomIntBetween(1, 5));

    group("Slow Transactions", function () {
        const x_api_session = uuidData[Math.floor(Math.random() * uuidData.length)];
        let res = http.get("http://localhost:8000/latency/degrading", {
            headers: {'X-API-Session': x_api_session},
            tags: {name: "GET slow_transaction"}
        });

        // Record time to first byte and tag it with the URL to be able to filter the results in Insights
        timeToFirstByte.add(res.timings.waiting, {ttfbURL: res.url});
    });
}
