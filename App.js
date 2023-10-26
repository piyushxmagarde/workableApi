const express = require('express');
const axios = require('axios');
const xlsx = require('node-xlsx');
const XLSX = require('xlsx');
const fs = require('fs');

const app = express();
app.use(express.json());

const port = process.env.PORT || 4000;
const CANDIDATES_URL = 'https://accellor.workable.com/spi/v3/candidates?limit=1000';
const JOBS_URL = 'https://accellor.workable.com/spi/v3/jobs?limit=500';
const REQUISITION_URL = 'https://accellor.workable.com/spi/v3/requisitions?limit=500'
const BEARER_TOKEN = 'I7zr5URAeCW3uXXNI8UiZ4LOEEu47eeuoBB1Ji8wewM';
const candidatesFilePath = './candidates.xlsx';
const jobsFilePath = './jobsData.xlsx';

const config = {
  headers: {
    'Authorization': `Bearer ${BEARER_TOKEN}`
  }
};

let jobs;
let requisitions;
let previousCandidatesData = null;
let previousJobsData = null;

async function getJobs() {
  const response = await axios.get(JOBS_URL, config);
  const responseData = response.data;
  jobs = responseData.jobs;
}
async function getRequisition() {
  const response = await axios.get(REQUISITION_URL, config);
  const responseData = response.data;
  requisitions = responseData.requisitions;
}
// fetch requisitions on server start
getRequisition();
// Fetch jobs on server start
getJobs();

async function fetchAllCandidatesData(CANDIDATES_URL, allCandidates = []) {
    console.log('function running');
    try {
        const response = await axios.get(CANDIDATES_URL, config);
        const responseData = response.data;
        
        allCandidates = allCandidates.concat(responseData.candidates);

        if (responseData.paging && responseData.paging.next) {
            // If there are more pages, recursively fetch data from the next page.
            return fetchAllCandidatesData(responseData.paging.next, allCandidates);
        } else {
            // All data has been fetched, return it.
            return allCandidates;
        }
    } catch (error) {
        if (error.response && error.response.status === 503) {
            // Retry the request after a delay (e.g., 5 seconds).
            await new Promise(resolve => setTimeout(resolve, 5000));
            return fetchAllCandidatesData(CANDIDATES_URL, allCandidates);
        } else {
            throw error;
        }
    }
}


// (async () => {
//     try {
//         let candidatesData = await fetchAllCandidatesData(CANDIDATES_URL);
//         console.log(candidatesData);
//     } catch (error) {
//         console.error(error);
//     }
// })();



app.post('/api/candidates/excel', async (req, res) => {
  try {
    // const responses = await axios.get(CANDIDATES_URL, config);
    // const responseDatas = responses.data;
    const candidates = await fetchAllCandidatesData(CANDIDATES_URL);
    console.log(candidates);
    // Process candidates data
    candidates.forEach((candidate) => {
      jobs.forEach((job) => {
        if (candidate.job.shortcode === job.shortcode) {
          const location = job.location;
          Object.assign(candidate, {
            Country: location.country,
            countryCode: location.country_code,
            Region: location.region,
            SubDepartment: job.department
          });
        }
      });

      requisitions.forEach((requisition) => {
        if(candidate.job.shortcode === requisition.job.shortcode){
          if(requisition.hiring_manager !== null && requisition.start_date !== null ){
          Object.assign(candidate, {
            Recruiter: requisition.hiring_manager.name,
            StartDate: requisition.start_date
          });
        }
        }
      });
    });
    
    

    // Prepare data array for Excel
    const dataArray = [
      ['Name', 'First Name', 'Last Name', 'Headline', 'Account', 'Job Title', 'shortcode', 'Stage', 'Disqualified', 'Disqualification Reason', 'Hired At', 'Sourced', 'Profile URL', 'Address', 'Phone', 'Email', 'Domain', 'Created At', 'Updated At', 'Country', 'countryCode', 'Region', 'Department','Recruiter', 'StartDate'],
      ...candidates.map(({
        name,
        firstname,
        lastname,
        headline,
        account,
        job,
        shortcode,
        stage,
        disqualified,
        disqualification_reason,
        hired_at,
        sourced,
        profile_url,
        address,
        phone,
        email,
        domain,
        created_at,
        updated_at,
        Country,
        countryCode,
        Region,
        SubDepartment,
        Recruiter,
        StartDate
      }) => [name, firstname, lastname, headline, account, job.title, shortcode, stage, disqualified, disqualification_reason, hired_at, sourced, profile_url, address, phone, email, domain, created_at, updated_at, Country, countryCode, Region, SubDepartment, Recruiter, StartDate])
    ];

    // Check if the response data has changed
    if (JSON.stringify(candidates) !== JSON.stringify(previousCandidatesData)) {
      // Build the xlsx file buffer
      const buffer = xlsx.build([{ name: 'data', data: dataArray }]);

      // Write the buffer to the file
      fs.writeFileSync(candidatesFilePath, buffer);

      previousCandidatesData = candidates;

      res.json({
        message: 'Data written to Excel file'
      });
    } else {
      res.json({
        message: 'Data not written to Excel file (no changes)'
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Internal Server Error'
    });
  }
});

app.post('/api/v3/jobs/excel', async (req, res) => {
  try {
    const response = await axios.get(JOBS_URL, config);
    const responseData = response.data;
    const jobs = responseData.jobs;

    // Prepare jobs data for Excel
    jobs.map(job => {
      const departmentHierarchy = job.department_hierarchy;
      if (departmentHierarchy && departmentHierarchy.length > 0) {
        const firstDepartment = departmentHierarchy[0];
        job.department_hierarchy = firstDepartment.name;
        job.department_hierarchy = JSON.stringify(job.department_hierarchy);
      } else {
        job.department_hierarchy = '';
      }
      return job;
    });

    // Create a new workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(jobs);

    // Add country, country code, and region as new columns in the worksheet
    XLSX.utils.sheet_add_aoa(ws, [['Country', 'Country Code', 'Region']], { origin: 'R1' });

    jobs.forEach((job, index) => {
      const location = job.location;
      const country = location.country;
      const country_code = location.country_code;
      const region = location.region;

      // Add the country, country_code, and region to new columns in the worksheet
      XLSX.utils.sheet_add_aoa(ws, [[country, country_code, region]], { origin: `R${index + 2}` });
    });

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    // Save the workbook to a file
    if (JSON.stringify(responseData) !== JSON.stringify(previousJobsData)) {
      XLSX.writeFile(wb, jobsFilePath);
      res.send({
        message: 'Data written to Excel file'
      });

      previousJobsData = responseData;
    } else {
      res.send({
        message: 'No change found'
      });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
