# Reset admin password to 'admin'
docker exec -e PGPASSWORD=Cc061mjw0! pds-postgres psql -U postgres -d pds -c "UPDATE \"Users\" SET \"PasswordHash\" = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918' WHERE \"Username\" = 'admin';"
Write-Host "Admin password reset to 'admin'"