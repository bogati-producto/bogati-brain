const fs = require('fs');
const path = require('path');

const BRAIN_DIR = path.join(__dirname, '../../');
const WEB_DIR = path.join(BRAIN_DIR, 'bogati-brain-web');
const OUTPUT_FILE = path.join(__dirname, '../public/brain-data.json');
const API_DATA_FILE = path.join(__dirname, '../src/data/brain-data.json');

const EXCLUDED_DIRS = ['bogati-brain-web', '.git', '.gemini', 'node_modules'];

function scanDirectory(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!EXCLUDED_DIRS.includes(file)) {
        scanDirectory(filePath, fileList);
      }
    } else if (file.endsWith('.md') || file.endsWith('.csv')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function generateGraphData() {
  const mdFiles = scanDirectory(BRAIN_DIR);
  
  const nodes = [];
  const links = [];
  const categories = new Set();
  
  // Add Central Hub
  nodes.push({
    id: 'BOGATI_BRAIN',
    label: 'BOGATI BRAIN',
    group: 'hub',
    content: 'Centro de Inteligencia Bogati'
  });

  mdFiles.forEach(file => {
    const relativePath = path.relative(BRAIN_DIR, file).replace(/\\/g, '/');
    const folderName = path.dirname(relativePath);
    const ext = path.extname(file);
    const fileName = path.basename(file, ext);
    const content = fs.readFileSync(file, 'utf8');
    
    let group = folderName === '.' ? 'root' : folderName;
    if (folderName !== '.' && folderName.split('/').length > 0) {
      group = folderName.split('/')[0];
    }
    
    categories.add(group);
    
    nodes.push({
      id: relativePath,
      label: fileName,
      group: group,
      content: content
    });
    
    // Connect to category node or hub
    links.push({
      source: 'BOGATI_BRAIN',
      target: relativePath,
      value: 1
    });
  });

  const graphData = {
    nodes,
    links
  };

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(graphData, null, 2));
  
  const apiDataDir = path.dirname(API_DATA_FILE);
  if (!fs.existsSync(apiDataDir)) {
    fs.mkdirSync(apiDataDir, { recursive: true });
  }
  fs.writeFileSync(API_DATA_FILE, JSON.stringify(graphData, null, 2));
  
  console.log(`Successfully generated graph data with ${nodes.length} nodes and ${links.length} links.`);
}

generateGraphData();
