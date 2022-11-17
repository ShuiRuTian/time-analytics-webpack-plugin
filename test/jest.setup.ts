require('ts-node').register({ transpileOnly: true });

const setup = (): void => {
    console.log('from global setup');
};

export default setup;