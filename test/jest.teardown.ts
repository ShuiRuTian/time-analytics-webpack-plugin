require('ts-node').register({ transpileOnly: true });

const teardown = (): void => {
    console.log('Hello from global teardown');
};

export default teardown;