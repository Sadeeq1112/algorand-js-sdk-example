const algosdk = require('algosdk');
const ALGOD_TOKEN = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ALGOD_SERVER = 'http://localhost';
const ALGOD_PORT = 4001;
const FUNDING_AMOUNT = 10_000_000;
const MIN_FEE = 1_000; 

class AlgorandAccountManager {
    constructor() {
        this.algodClient = new algosdk.Algodv2(ALGOD_TOKEN, ALGOD_SERVER, ALGOD_PORT);
        this.accounts = {
            A: null,
            B: null
        };
    }

  
    createAccounts() {
        this.accounts.A = algosdk.generateAccount();
        this.accounts.B = algosdk.generateAccount();

        console.log('Created Account A:', this.accounts.A.addr);
        console.log('Created Account B:', this.accounts.B.addr);
    }

    /**
     * Wait for a transaction to be confirmed
     * @param {string} txId - Transaction ID to wait for
     * @returns {Promise<void>}
     */
    async waitForConfirmation(txId) {
        const status = await this.algodClient.status().do();
        let lastRound = status['last-round'];
        
        while (true) {
            const pendingInfo = await this.algodClient.pendingTransactionInformation(txId).do();
            if (pendingInfo['confirmed-round'] !== null && pendingInfo['confirmed-round'] > 0) {
                break;
            }
            lastRound++;
            await this.algodClient.statusAfterBlock(lastRound).do();
        }
    }

    /**
     * Fund accounts using LocalNet's dispenser account
     * @returns {Promise<void>}
     */
    async fundAccounts() {
        try {
            const dispenserAccount = algosdk.mnemonicToSecretKey(
                "YOUR_LOCALNET_DISPENSER_MNEMONIC"
            );

            const suggestedParams = await this.algodClient.getTransactionParams().do();

            // Fund Account A
            const txnA = algosdk.makePaymentTxnWithSuggestedParams(
                dispenserAccount.addr,
                this.accounts.A.addr,
                FUNDING_AMOUNT,
                undefined,
                undefined,
                suggestedParams
            );
            
            // Fund Account B
            const txnB = algosdk.makePaymentTxnWithSuggestedParams(
                dispenserAccount.addr,
                this.accounts.B.addr,
                FUNDING_AMOUNT,
                undefined,
                undefined,
                suggestedParams
            );

            const signedTxnA = txnA.signTxn(dispenserAccount.sk);
            const signedTxnB = txnB.signTxn(dispenserAccount.sk);

            const txIdA = await this.algodClient.sendRawTransaction(signedTxnA).do();
            const txIdB = await this.algodClient.sendRawTransaction(signedTxnB).do();

            await this.waitForConfirmation(txIdA.txId);
            await this.waitForConfirmation(txIdB.txId);

            console.log('Successfully funded both accounts with 10 Algos each');
        } catch (error) {
            throw new Error(`Error funding accounts: ${error.message}`);
        }
    }

    /**
     * Rekey Account A to Account B
     * @returns {Promise<void>}
     */
    async rekeyAccountA() {
        try {
            const suggestedParams = await this.algodClient.getTransactionParams().do();

            const rekeyTxn = algosdk.makePaymentTxnWithSuggestedParams(
                this.accounts.A.addr,
                this.accounts.A.addr,
                0,
                undefined,
                undefined,
                suggestedParams,
                this.accounts.B.addr
            );

            const signedRekeyTxn = rekeyTxn.signTxn(this.accounts.A.sk);
            const txId = await this.algodClient.sendRawTransaction(signedRekeyTxn).do();
            await this.waitForConfirmation(txId.txId);

            console.log('Successfully rekeyed Account A to Account B');
        } catch (error) {
            throw new Error(`Error rekeying account: ${error.message}`);
        }
    }

    /**
     * Transfer all Algos from Account A to Account B
     * @returns {Promise<void>}
     */
    async transferAlgos() {
        try {
            const accountInfo = await this.algodClient.accountInformation(this.accounts.A.addr).do();
            const balance = accountInfo.amount;
            const transferAmount = balance - MIN_FEE;

            if (transferAmount <= 0) {
                throw new Error('Insufficient funds for transfer');
            }

            const suggestedParams = await this.algodClient.getTransactionParams().do();

            const transferTxn = algosdk.makePaymentTxnWithSuggestedParams(
                this.accounts.A.addr,
                this.accounts.B.addr,
                transferAmount,
                undefined,
                undefined,
                suggestedParams
            );

           
            const signedTransferTxn = transferTxn.signTxn(this.accounts.B.sk);
            const txId = await this.algodClient.sendRawTransaction(signedTransferTxn).do();
            await this.waitForConfirmation(txId.txId);

            console.log(`Successfully transferred ${transferAmount} microAlgos from Account A to Account B`);
        } catch (error) {
            throw new Error(`Error transferring Algos: ${error.message}`);
        }
    }

    /**
     * Get account balances
     * @returns {Promise<void>}
     */
    async getBalances() {
        const accountAInfo = await this.algodClient.accountInformation(this.accounts.A.addr).do();
        const accountBInfo = await this.algodClient.accountInformation(this.accounts.B.addr).do();

        console.log(`Account A balance: ${accountAInfo.amount} microAlgos`);
        console.log(`Account B balance: ${accountBInfo.amount} microAlgos`);
    }
}

/**
 * Main execution function
 */
async function main() {
    const manager = new AlgorandAccountManager();

    try {
        // Execute the workflow
        manager.createAccounts();
        
        console.log('\nInitial balances:');
        await manager.getBalances();

        await manager.fundAccounts();
        console.log('\nBalances after funding:');
        await manager.getBalances();

        await manager.rekeyAccountA();
        await manager.transferAlgos();
        
        console.log('\nFinal balances:');
        await manager.getBalances();

    } catch (error) {
        console.error('Error executing workflow:', error.message);
        process.exit(1);
    }
}

// Execute the script
main();