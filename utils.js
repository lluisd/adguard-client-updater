import { exec } from 'child_process';
import ip from 'ip';

export function arraysEqual (arr1, arr2) {
  return arr1.length === arr2.length && arr1.every((value, index) => value === arr2[index]);
}

export function pingIP(ip) {
  return new Promise((resolve, reject) => {
    const command = ip.includes(':') ? `ping6 -c 1 ${ip} -W 1` : `ping -c 1 ${ip} -W 1`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        resolve(false);
        return;
      }

      const success = stdout.includes('1 packets received');
      const packetLoss = stdout.includes('100% packet loss') || stdout.includes('100.0% packet loss') || stdout.includes("100% packet loss");

      resolve(success && !packetLoss);
    });
  });
}

const macAddress =  /^([0-9a-fA-F][0-9a-fA-F]:){5}([0-9a-fA-F][0-9a-fA-F])$/;
export function isMacAddress(str) {
  return macAddress.test(str);
}

export function isIp (str) {
  return ip.isV4Format(str) || (!isMacAddress(str) && ip.isV6Format(str))
}