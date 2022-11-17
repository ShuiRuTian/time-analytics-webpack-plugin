require('ts-node').register({ transpileOnly: true });

const setup = (): void => {
    console.log('from global teardown');
};

export default setup;