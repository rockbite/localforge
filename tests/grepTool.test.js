import { fileURLToPath } from 'url';
import path from 'path';
import { grepTool } from '../tools/utils/searchUtils.js';

// Get directory path for this file to use for relative paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Set up test cases
async function runTests() {
  console.log('Running GrepTool tests...');
  
  // Test case for the specific pattern that failed
  const testOriginalPattern = async () => {
    console.log('\nTest: Original model pattern with OR conditions');
    const result = await grepTool({
      pattern: "Clear Chat|clear chat|trash|delete|mdi-|icon|<svg|material-icons", 
      path: projectRoot,
      include: "*.ejs"
    });
    
    const hasMatches = result.matches && result.matches.length > 0;
    console.log(`Pattern: "Clear Chat|clear chat|trash|delete|mdi-|icon|<svg|material-icons"`);
    console.log(`Include: "*.ejs"`);
    console.log(`Result has matches: ${hasMatches}`);
    
    if (hasMatches) {
      console.log('Found matches:');
      result.matches.forEach(match => {
        console.log(`- ${match.file}`);
        match.matches.slice(0, 3).forEach(line => {
          console.log(`  Line ${line.line}: ${line.content.trim()}`);
        });
        if (match.matches.length > 3) {
          console.log(`  ... and ${match.matches.length - 3} more matches`);
        }
      });
    } else {
      console.log('No matches found');
    }
    
    console.log(`Test ${hasMatches ? 'PASSED' : 'FAILED'} - Expected to find matches`);
  };
  
  // Test case for a simple "Clear Chat" pattern
  const testSimplePattern = async () => {
    console.log('\nTest: Simple pattern "Clear Chat"');
    const result = await grepTool({
      pattern: "Clear Chat",
      path: projectRoot,
      include: "*.ejs"
    });
    
    const hasMatches = result.matches && result.matches.length > 0;
    console.log(`Result has matches: ${hasMatches}`);
    
    if (hasMatches) {
      console.log('Found matches:');
      result.matches.forEach(match => {
        console.log(`- ${match.file}`);
        match.matches.forEach(line => {
          console.log(`  Line ${line.line}: ${line.content.trim()}`);
        });
      });
    }
    
    console.log(`Test ${hasMatches ? 'PASSED' : 'FAILED'} - Expected to find matches`);
  };
  
  // Test case for using regex OR directly
  const testRegexOr = async () => {
    console.log('\nTest: Regex OR pattern with one term');
    const result = await grepTool({
      pattern: "(Clear Chat)",
      path: projectRoot,
      include: "*.ejs"
    });
    
    const hasMatches = result.matches && result.matches.length > 0;
    console.log(`Result has matches: ${hasMatches}`);
    
    if (hasMatches) {
      console.log('Found matches:');
      result.matches.forEach(match => {
        console.log(`- ${match.file}`);
        match.matches.forEach(line => {
          console.log(`  Line ${line.line}: ${line.content.trim()}`);
        });
      });
    }
    
    console.log(`Test ${hasMatches ? 'PASSED' : 'FAILED'} - Expected to find matches`);
  };
  
  // Test directory path validation
  const testDirectoryPath = async () => {
    console.log('\nTest: Directory path - entire project vs views directory');
    
    const projectResult = await grepTool({
      pattern: "Clear Chat",
      path: projectRoot,
      include: "**/*.ejs"
    });
    
    const viewsResult = await grepTool({
      pattern: "Clear Chat",
      path: path.join(projectRoot, 'views'),
      include: "**/*.ejs"
    });
    
    console.log(`Project-wide search found matches: ${projectResult.matches?.length > 0}`);
    console.log(`Views directory search found matches: ${viewsResult.matches?.length > 0}`);
    
    if (projectResult.matches?.length > 0 && viewsResult.matches?.length === 0) {
      console.log('ISSUE DETECTED: Only finding matches when searching from project root');
    } else if (projectResult.matches?.length === 0 && viewsResult.matches?.length > 0) {
      console.log('ISSUE DETECTED: Only finding matches when searching from views directory');
    }
  };
  
  // Run all tests
  await testOriginalPattern();
  await testSimplePattern();
  await testRegexOr();
  await testDirectoryPath();
  
  console.log('\nAll tests completed');
}

// Run tests
runTests().catch(error => {
  console.error('Error running tests:', error);
});