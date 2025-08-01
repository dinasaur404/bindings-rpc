import { WorkerEntrypoint } from 'cloudflare:workers';

export class UserWorker extends WorkerEntrypoint {

  async fetch(request) {
    return new Response('UserWorker RPC service is running', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  // ========== R2 File Operations ==========
  async uploadFile(key, content) {
    try {
      await this.env.USER_R2.put(key, content);
      
      // Track file in KV
      const fileList = await this.getFileList();
      fileList.push({
        key,
        size: content.byteLength,
        uploaded: new Date().toISOString()
      });
      await this.env.USER_KV.put('files:list', JSON.stringify(fileList));
      
      return { success: true, key, size: content.byteLength };
    } catch (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }
  }

  async getFile(key) {
    try {
      const object = await this.env.USER_R2.get(key);
      return object ? object.body : null;
    } catch (error) {
      throw new Error(`Get file failed: ${error.message}`);
    }
  }

  async deleteFile(key) {
    try {
      await this.env.USER_R2.delete(key);
      
      // Remove from file list
      const fileList = await this.getFileList();
      const updatedList = fileList.filter(f => f.key !== key);
      await this.env.USER_KV.put('files:list', JSON.stringify(updatedList));
      
      return { success: true };
    } catch (error) {
      throw new Error(`Delete failed: ${error.message}`);
    }
  }

  // ========== KV Data Operations ==========
  async setData(key, value) {
    try {
      await this.env.USER_KV.put(key, JSON.stringify(value));
      await this.logActivity('set', key);
      return { success: true, key };
    } catch (error) {
      throw new Error(`Set data failed: ${error.message}`);
    }
  }

  async getData(key) {
    try {
      const value = await this.env.USER_KV.get(key);
      await this.logActivity('get', key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      throw new Error(`Get data failed: ${error.message}`);
    }
  }

  async deleteData(key) {
    try {
      await this.env.USER_KV.delete(key);
      await this.logActivity('delete', key);
      return { success: true };
    } catch (error) {
      throw new Error(`Delete data failed: ${error.message}`);
    }
  }

  // ========== Stats & Utilities ==========
  async getStats() {
    try {
      const fileList = await this.getFileList();
      const activityLog = await this.getActivityLog();
      
      const totalFiles = fileList.length;
      const totalSize = fileList.reduce((sum, f) => sum + f.size, 0);
      const lastActivity = activityLog.length > 0 ? 
        activityLog[activityLog.length - 1].timestamp : 'Never';

      return {
        files: { count: totalFiles, totalSize },
        activity: { totalOperations: activityLog.length, lastActivity },
        storage: await this.getStorageInfo()
      };
    } catch (error) {
      throw new Error(`Get stats failed: ${error.message}`);
    }
  }

  async listFiles() {
    return await this.getFileList();
  }

  async listData() {
    try {
      const list = await this.env.USER_KV.list();
      return list.keys
        .filter(k => !k.name.startsWith('files:') && !k.name.startsWith('activity:'))
        .map(k => ({ key: k.name, metadata: k.metadata }));
    } catch (error) {
      throw new Error(`List data failed: ${error.message}`);
    }
  }

  // ========== Helper Methods ==========
  async getFileList() {
    const fileListStr = await this.env.USER_KV.get('files:list');
    return fileListStr ? JSON.parse(fileListStr) : [];
  }

  async getActivityLog() {
    const activityStr = await this.env.USER_KV.get('activity:log');
    return activityStr ? JSON.parse(activityStr) : [];
  }

  async logActivity(action, key) {
    const log = await this.getActivityLog();
    log.push({
      action,
      key,
      timestamp: new Date().toISOString()
    });
    
    // Keep only last 100 activities
    if (log.length > 100) {
      log.splice(0, log.length - 100);
    }
    
    await this.env.USER_KV.put('activity:log', JSON.stringify(log));
  }

  async getStorageInfo() {
    try {
      const kvList = await this.env.USER_KV.list();
      const r2List = await this.env.USER_R2.list({ limit: 1000 });
      
      return {
        kvKeys: kvList.keys.length,
        r2Objects: r2List.objects.length
      };
    } catch (error) {
      return { kvKeys: 0, r2Objects: 0 };
    }
  }
}

export default UserWorker;
