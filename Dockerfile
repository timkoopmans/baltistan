FROM grafana/k6

WORKDIR /tests
ADD scripts /tests/scripts
CMD ["run", "--vus", "10", "--duration", "30s", "-e", "TEST_NAME=Basic test", "/tests/scripts/basic.js"]