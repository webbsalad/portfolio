from django.urls import path
from .views import *
from django.views.generic import RedirectView

urlpatterns = [
    path('', exchange),
    path('prog', prog),
    path('explanation', explanation),
    path('cw', cw),
    path('db', db),

    path('set_language/', set_language, name='set_language'),


]