ЛР 1:
1) был создан проект с использованием django-admin
2) далее был настроен Django в файлах settings и связан с приложением Django
3) проект был связан с репозиторием GitHub для более удобного коммита
4) далее был создан файл vercel.json для связи сайта с Vercel         
Vercel.json:
            {
                "builds": [{
                    "src": "suvorov/wsgi.py",
                    "use": "@vercel/python",
                    "config": { "maxLambdaSize": "15mb", "runtime": "python3.9" }
                }],
                "routes": [
                    {
                        "src": "/(.*)",
                        "dest": "suvorov/wsgi.py"
                    }
                ]
            }
5) GitHub был подключен к Vercel и практически автоматически задеплоен

ЛР2:
1) для оформления CSS были созданны статистические файлы style.css с помошью комманды python manage.py collectstatic они были загруженны в проект
2) также были загруженны сторонние статистические файлы с помошью строки в файле base.html <link rel="stylesheet" href="{% static 'css/style.css' %}">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@4.2.1/dist/css/bootstrap.min.css" integrity="sha384-GJzZqFGwb1QTTN6wy59ffF1BuGJpLSa9DkKMp0DgiMDm4iYMj70gZWKYbI706tWS" crossorigin="anonymous">
3) были созданы страницы cw.html и prog.html для выкладывания работ на данных страницах
4) было реализовано оформление с помошью настройки стиля css и настройки img
5) был реализован перевод сайта на английский язык для этого были добавлены блоки в файл settings.py также была добавлен изменяемый url в urls.py и функция в views.py для реализации перехода
     также с помошью комманды django-admin makemessages -l en был создан файл /locate/en/LC_MESSAGE/django.po и после заполнения в него перевода с помошью msgid/msgstr была запущена команда msgfmt -o django.mo django.po для создания файла django.mo
   
