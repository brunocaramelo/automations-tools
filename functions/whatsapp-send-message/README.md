# RUN UNIQUE

node index.js --targets=leads_novos_1.json --message=0

## RUNNING MORE TIMES

node index.js --targets=leads_novos_1.json --message=0 && sleep 90 && node index.js --targets=leads_novos_2.json --message=0 && sleep 150 && node index.js --targets=leads_novos_3.json --message=0