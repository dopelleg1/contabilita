const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const projectRoot = path.resolve(__dirname, '..');
const desktopPath = 'C:\\Users\\super\\Desktop';
const zipPath = path.join(desktopPath, 'ContoSmart_Latest_Code.zip');

function getFilesRecursively(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Ignore folders we don't want
    if (stat.isDirectory()) {
      if (file === 'node_modules' || file === '.git' || file === 'dist' || file === 'my-app' || file === 'my-app-backup' || file === 'php-installer') {
        continue;
      }
      getFilesRecursively(filePath, fileList);
    } else {
      // Keep only source code and configuration files
      const ext = path.extname(file).toLowerCase();
      if (['.ts', '.tsx', '.json', '.prisma', '.html', '.css', '.js'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

try {
  console.log("Creazione pacchetto di sincronizzazione per AI Studio...");
  const zip = new AdmZip();
  
  // 1. Pack individual root configuration and source files
  const rootFiles = ['database.ts', 'server.ts', 'package.json', 'tsconfig.json', 'vite.config.ts', 'index.html'];
  for (const rf of rootFiles) {
    const fp = path.join(projectRoot, rf);
    if (fs.existsSync(fp)) {
      zip.addLocalFile(fp);
      console.log(`+ Aggiunto file root: ${rf}`);
    }
  }

  // 2. Pack prisma schema
  const prismaSchema = path.join(projectRoot, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaSchema)) {
    zip.addLocalFile(prismaSchema, 'prisma');
    console.log('+ Aggiunto schema database: prisma/schema.prisma');
  }

  // 3. Pack src folder recursively
  const srcDir = path.join(projectRoot, 'src');
  if (fs.existsSync(srcDir)) {
    const srcFiles = getFilesRecursively(srcDir);
    for (const sf of srcFiles) {
      const relativePath = path.relative(srcDir, sf);
      const zipPathInZip = path.dirname(path.join('src', relativePath));
      zip.addLocalFile(sf, zipPathInZip);
    }
    console.log(`+ Aggiunta cartella sorgente src/ (${srcFiles.length} file)`);
  }

  // Save the ZIP to Desktop
  zip.writeZip(zipPath);
  console.log(`\n🎉 Pacchetto creato con successo sul Desktop!`);
  console.log(`Percorso: ${zipPath}`);
} catch (err) {
  console.error("Errore durante la creazione del pacchetto:", err);
}
