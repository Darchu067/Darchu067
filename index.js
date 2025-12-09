#!/usr/bin/env node
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const api = require('./js/GitApi');
const { username, token: GITHUB_TOKEN } = require('./js/GitApi');

if (GITHUB_TOKEN) api.setToken(GITHUB_TOKEN);

const CATEGORIES = {};

function formatName(s) {
  return s
    .replace('nodejs', 'Node.js').replace('node.js', 'Node.js')
    .replace('vue.js', 'Vue.js')
    .replace('react.js', 'React').replace('html', 'HTML').replace('css', 'CSS')
    .replace('sql', 'SQL')
    .replace('power-bi', 'Power BI').replace('powerbi', 'Power BI')
    .replace('n8n', 'n8n')
    .charAt(0).toUpperCase() + s.slice(1);
}

function getTopItems(map, limit) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item.toLowerCase());
}

async function analyzeSkills(repos) {
  const languageCount = new Map();
  const topicCount = new Map();
  
  repos.forEach(repo => {
    if (repo.language) {
      const lang = repo.language.trim();
      languageCount.set(lang, (languageCount.get(lang) || 0) + 1);
    }
  });
  
  const recentRepos = repos
    .filter(r => !r.fork && !r.archived && !r.private)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 10);
  
  for (const repo of recentRepos) {
    try {
      const response = await api.get(`/repos/${repo.owner.login}/${repo.name}/topics`, {
        headers: { 'Accept': 'application/vnd.github.mercy-preview+json' }
      });
      const topics = response.names || [];
      topics.forEach(topic => {
        const t = topic.trim().toLowerCase();
        topicCount.set(t, (topicCount.get(t) || 0) + 1);
      });
    } catch (error) {
      // Continua mesmo se falhar
    }
  }
  
  const topLanguages = getTopItems(languageCount, 10);
  const topTopics = getTopItems(topicCount, 15);
  
  const result = {};
  Object.entries(CATEGORIES).forEach(([key, list]) => {
    const items = Array.from(new Set([
      ...topLanguages.filter(item => list.includes(item)),
      ...topTopics.filter(item => list.includes(item))
    ])).map(formatName);
    result[key] = items;
  });
  
  return result;
}

function updateSectionInReadme(startMarker, endMarker, contentLines) {
  const readmePath = path.join(process.cwd(), 'README.md');
  let readmeContent = fs.readFileSync(readmePath, 'utf8');
  
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escapedStart}[\\s\\S]*?${escapedEnd}`);
  const newBlock = contentLines.length > 0 
    ? `${startMarker}\n${contentLines.join('\n')}\n${endMarker}`
    : `${startMarker}\n${endMarker}`;
  
  if (pattern.test(readmeContent)) {
    readmeContent = readmeContent.replace(pattern, newBlock);
  } else {
    readmeContent = `${readmeContent.trim()}\n\n${newBlock}\n`;
  }
  
  fs.writeFileSync(readmePath, readmeContent, 'utf8');
  return readmeContent;
}

function updateSkillsInReadme(skills) {
  const labels = {
    backend: 'Backend',
    frontend: 'Frontend',
    devops: 'DevOps/Infra',
    database: 'Banco de dados',
    data: 'Análise de Dados',
    automation: 'Automação'
  };
  
  const skillsLines = Object.entries(skills)
    .filter(([_, items]) => items.length > 0)
    .map(([key, items]) => `- ${labels[key] || key}: ${items.join(', ')}`);
  
  if (skillsLines.length === 0) {
    skillsLines.push('- SQL: Consultas, criação de tabelas e organização de dados');
    skillsLines.push('- Power BI: Criação de dashboards e relatórios visuais');
    skillsLines.push('- n8n: Automação de processos e integração de dados');
    skillsLines.push('- AutoCAD: Básico');
    skillsLines.push('- Inglês: Intermediário');
    skillsLines.push('- Pacote Office');
  }
  
  updateSectionInReadme('<!-- SKILLS:START -->', '<!-- SKILLS:END -->', skillsLines);
  console.log('Skills atualizado!');
  skillsLines.forEach(line => console.log(`  ${line}`));
}

async function getFeaturedProjects(repos) {
  const featuredRepos = repos
    .filter(r => !r.fork && !r.archived && !r.private)
    .sort((a, b) => {
      // Ordena por: estrelas primeiro, depois por data de atualização
      const starsDiff = (b.stargazers_count || 0) - (a.stargazers_count || 0);
      if (starsDiff !== 0) return starsDiff;
      return new Date(b.pushed_at) - new Date(a.pushed_at);
    })
    .slice(0, 6);
  
  return featuredRepos.map(repo => {
    const description = repo.description || 'Sem descrição.';
    return `- [${repo.name}](${repo.html_url}): ${description}`;
  });
}

async function getProjectsWithOpenIssues(repos) {
  const projectsWithIssues = [];
  
  // Verificar os repositórios mais recentes primeiro
  const reposToCheck = repos
    .filter(r => !r.fork && !r.archived && !r.private)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))
    .slice(0, 20);
  
  for (const repo of reposToCheck) {
    try {
      // A API retorna issues e PRs, precisamos filtrar apenas issues (sem pull_request)
      const issues = await api.get(`/repos/${repo.owner.login}/${repo.name}/issues`, {
        params: { state: 'open', per_page: 100 }
      });
      
      if (Array.isArray(issues)) {
        // Filtrar apenas issues (sem pull_request field)
        const onlyIssues = issues.filter(issue => !issue.pull_request);
        const openIssuesCount = onlyIssues.length;
        
        if (openIssuesCount > 0) {
          projectsWithIssues.push({
            name: repo.name,
            url: repo.html_url,
            openIssues: openIssuesCount
          });
        }
      }
    } catch (error) {
      // Continua mesmo se falhar
      // console.error(`Erro ao buscar issues de ${repo.name}:`, error.message);
    }
  }
  
  return projectsWithIssues
    .sort((a, b) => b.openIssues - a.openIssues)
    .slice(0, 5)
    .map(proj => `- [${proj.name}](${proj.url}) — issues abertas: ${proj.openIssues}`);
}

async function getGitHubInsights(repos) {
  try {
    // Obter informações do usuário
    const user = await api.get(`/users/${username}`);
    
    // Calcular estatísticas dos repositórios
    const publicRepos = repos.filter(r => !r.private && !r.fork);
    const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    const totalForks = repos.reduce((sum, repo) => sum + (repo.forks_count || 0), 0);
    const totalWatchers = repos.reduce((sum, repo) => sum + (repo.watchers_count || 0), 0);
    
    // Contar linguagens únicas
    const languages = new Set();
    repos.forEach(repo => {
      if (repo.language) {
        languages.add(repo.language);
      }
    });
    
    // Repositório mais estrelado
    const mostStarred = repos
      .filter(r => !r.fork && !r.archived && !r.private)
      .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0))[0];
    
    const insightsLines = [
      `![GitHub Stats](https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&theme=radical&hide_border=true)`,
      ``,
      `![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&layout=compact&theme=radical&hide_border=true)`,
      ``,
      `### 📊 Estatísticas`,
      `- **Repositórios públicos:** ${publicRepos.length}`,
      `- **Total de estrelas recebidas:** ${totalStars}`,
      `- **Total de forks:** ${totalForks}`,
      `- **Linguagens utilizadas:** ${languages.size}`,
      mostStarred ? `- **Repositório mais estrelado:** [${mostStarred.name}](${mostStarred.html_url}) (${mostStarred.stargazers_count || 0} ⭐)` : ''
    ].filter(line => line !== '');
    
    return insightsLines;
  } catch (error) {
    console.error('Erro ao buscar insights:', error.message);
    // Retorna estatísticas básicas mesmo se falhar
    const publicRepos = repos.filter(r => !r.private && !r.fork);
    const totalStars = repos.reduce((sum, repo) => sum + (repo.stargazers_count || 0), 0);
    
    return [
      `![GitHub Stats](https://github-readme-stats.vercel.app/api?username=${username}&show_icons=true&theme=radical&hide_border=true)`,
      ``,
      `![Top Languages](https://github-readme-stats.vercel.app/api/top-langs/?username=${username}&layout=compact&theme=radical&hide_border=true)`,
      ``,
      `### 📊 Estatísticas`,
      `- **Repositórios públicos:** ${publicRepos.length}`,
      `- **Total de estrelas recebidas:** ${totalStars}`
    ];
  }
}

async function main() {
  try {
    console.log(`Atualizando README para ${username}...\n`);
    
    const repos = await api.getAllPaginated(`/users/${username}/repos`, {
      perPageParam: 'per_page',
      maxPages: 10
    });
    
    if (repos.length === 0) {
      console.warn('Nenhum repositório encontrado.');
      return;
    }
    
    console.log('Atualizando competências técnicas...');
    const skills = await analyzeSkills(repos);
    updateSkillsInReadme(skills);
    
    console.log('\nAtualizando projetos em destaque...');
    const featuredProjects = await getFeaturedProjects(repos);
    updateSectionInReadme('<!-- PROJECTS:START -->', '<!-- PROJECTS:END -->', featuredProjects);
    console.log(`  ${featuredProjects.length} projetos adicionados`);
    
    console.log('\nAtualizando projetos com issues abertas...');
    const projectsWithIssues = await getProjectsWithOpenIssues(repos);
    updateSectionInReadme('<!-- ISSUES_OPEN:START -->', '<!-- ISSUES_OPEN:END -->', projectsWithIssues);
    console.log(`  ${projectsWithIssues.length} projetos com issues encontrados`);
    
    console.log('\nAtualizando insights do GitHub...');
    const insights = await getGitHubInsights(repos);
    updateSectionInReadme('<!-- INSIGHTS:START -->', '<!-- INSIGHTS:END -->', insights);
    console.log('  Insights atualizados!');
    
    console.log('\n✅ README atualizado com sucesso!');
  } catch (error) {
    console.error('Erro:', error.message);
    if (error.url) console.error(`   URL: ${error.url}`);
    process.exit(1);
  }
}

main();

