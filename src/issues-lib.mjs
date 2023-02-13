import createError from 'http-errors'
import { Octokit } from 'octokit'

import { workBranchName } from '@liquid-labs/git-toolkit'

import { determineGitHubLogin } from './access-lib'

const claimIssues = ({ 
  assignee,
  authToken, 
  claimLabel='assigned', 
  comment/* default below*/, 
  issues, noAutoAssign=false
}) => {
  const octokit = new Octokit({ auth: authToken })
  const workBranch = workBranchName({ primaryIssueID: issues[0] })
  comment = comment || `Work for this issue will begin begin on branch ${workBranch}.`

  if (assignee === undefined && noAutoAssign !== true) {
    assignee = determineGitHubLogin({ authToken })
  }

  const issuesUpated = []
  for (const issue of issues) {
    const [ projectFQN, issueNumber ] = issue.split('-')
    const [ org, projectBaseName ] = projectFQN.split('/')

    try {
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
        owner: org,
        repo: projectBaseName,
        issue_number: issueNumber,
        labels: [ claimLabel ]
      })
    }
    catch (e) {
      throwVerifyError({ e, issueId, issuesUpated, targetName: claimLabel, targetType: 'label' })
    }

    try {
      await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
        owner: org,
        repo: projectBaseName,
        issue_number: issueNumber,
        body: comment
      })
    }
    catch (e) {
      throwVerifyError({ e, issueId, issuesUpated, targetType: 'comment' })
    }

    if (assignee !== undefined) {
      try {
        await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/assignees', {
          owner: org,
          repo: projectBaseName,
          issue_number: issueNumber,
          assignees: [ assignee ]
        })
      }
      catch (e) {
        throwVerifyError({ e, issueId, issuesUpated, targetName: assignee, targetType: 'assignee' })
      }
    }
  } // for (const issue...)
}

const verifyIssuesExist = ({ authToken, issues, notClosed=false }) => {
  const issueData = []
  const octokit = new Octokit({ auth: authToken })

  for (const issueSpec of issues) {
    const [ projectFQN, number ] = issueSpec.split('-')

    const issue = await octokit.request(`GET /repos/{owner}/{repo}/issues/{issue_number}`, {
      owner: org,
      repo: project,
      issue_number: number
    })

    if (!issue) throw createError.NotFound(`No issue found. Verify issue '${issueSpec}' is valid.`)

    if (noClosed === true && issue.state === 'closed') {
      throw createError.BadRequest(`Issue ${issueSpec} is 'closed'.`)
    }

    issueData.push(issue)
  } // for (... issues)
  // all good!
  return issueData
}

const verifyIssuesAvailable = ({ authToken, issues }) => {
  const issueData = verifyIssuesExist({ authToken, issues, notClosed: true })
  
  const octokit = new Octokit({ auth: authToken })

  // first, we check everything
  for (const issue of issueData) {
    const issueId = issue.url.replace(new RegExp('.+/([^/]+/[^/]+)/issues/(\d+)'), '$1-$2')
    
    if ((issueData.labels || []).some((l) => l.name === claimLabel) || l.assignees?.length > 0) {
      throw createError.BadRequest(`Issue ${issueId} has already been claimed.`)
    }
  }
}

const throwVerifyError = ({ e, issueId, issuesUpated, targetName, targetType }) => {
  let message = ''
  if (issuesUpated.length > 0)
    message += `Operation partially succeeded and the following issues were updated: ${issuesUpated.join(', ')}. `
  message += `There was an error adding ${targetName ? 'the' : 'a'} ${targetType} ${targetName ? `'${targetName}'` : ''} to ${issueId}: ${e.message}.`

  throw createError.InternalServerError(message, { cause: e })
}

export { 
  verifyIssuesExist,
  verifyIssuesAvailableAndClaim
}