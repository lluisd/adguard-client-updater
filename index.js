import dotenv from 'dotenv';
import { neigh } from 'ip-wrapper';
import { pingIP, arraysEqual, isMacAddress, isIp } from './utils.js';

dotenv.config();

const staleIPs = {}; // Object to track stale IPs with TTL

const adguardConfig = {
  api: process.env.ADGUARD_API || 'http://127.0.0.1:3000',
  username:  process.env.ADGUARD_USERNAME || 'admin',
  password: process.env.ADGUARD_PASSWORD || 'password'
};

const API_ENDPOINTS = {
  CLIENTS: '/control/clients',
  CLIENTS_UPDATE: '/control/clients/update'
};

async function adguardFetch(endpoint, method, body) {
  try {
    const response = await fetch(`http://${adguardConfig.api}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + Buffer.from(`${adguardConfig.username}:${adguardConfig.password}`).toString('base64')
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.text()
  } catch (error) {
    console.log(error);
    throw error;
  }
}


async function updateClients() {
  try {
    let [neighbors, existingClients] = await Promise.all([
      neigh.show(),
      adguardFetch(API_ENDPOINTS.CLIENTS, 'GET')
    ]);

    existingClients = JSON.parse(existingClients);

    const neighborIPsByMAC = neighbors.reduce((acc, neighbor) => {
      if (neighbor.lladdr && neighbor.dst) {
        acc[neighbor.lladdr] = (acc[neighbor.lladdr] || []);
        acc[neighbor.lladdr].push(neighbor.dst);
      }
      return acc;
    }, {});

    const clientUpdates = existingClients.clients.map(async (client) => {
      const macAddresses = client.ids.filter(id => isMacAddress(id));
      const originalClientIps = client.ids.filter(id => isIp(id));
      let ipsForClient = [...originalClientIps];

      macAddresses.forEach(mac => {
        if (neighborIPsByMAC[mac]) {
          ipsForClient = neighborIPsByMAC[mac];
        }
      });

      const pingResults = await Promise.allSettled(ipsForClient.map(ip => pingIP(ip)));
      ipsForClient = ipsForClient.filter((ip, index) => {
        const isAlive = pingResults[index];
        if (isAlive) {
          if (staleIPs[ip]) {
            delete staleIPs[ip];
          }
        } else {
          staleIPs[ip] = (staleIPs[ip] || 0) + 1;
        }
        return isAlive || (staleIPs[ip] <= 100);
      });

      const updatedIds = [...new Set([...ipsForClient])];

      console.log(`Client ${client.name} has IPs: ${originalClientIps} and updated IPs: ${updatedIds}`)
      if (!arraysEqual(originalClientIps, updatedIds)) {
        client.ids = updatedIds.concat(client.ids.filter(id => !isIp(id)));
        const updateObj = {
          name: client.name,
          data: client
        };

        console.log(`Updating client ${client.name} with new IDs: ${updatedIds}`);
        return adguardFetch(API_ENDPOINTS.CLIENTS_UPDATE, 'POST', updateObj);
      }
    });

    await Promise.allSettled(clientUpdates);
  } catch (error) {
    console.error('Unable to update AdGuard clients', error.message);
  }
}


console.log('Started AdGuard client updater\n-----------------------------');
await updateClients();
setInterval(updateClients, 60000);
