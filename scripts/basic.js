import http from 'k6/http';
import {sleep} from 'k6';

export let options = {
    ext: {
        loadimpact: {
            projectID: 3631083,
            name: `${__ENV.TEST_NAME}`
        }
    }
}
export default function () {
    http.get('https://test.k6.io');
    sleep(1);
}
